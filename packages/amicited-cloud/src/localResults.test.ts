import { answeredResult, unansweredResult } from "@amicited/visibility/result";
import { expect, it } from "vite-plus/test";
import {
  itemDisposition,
  localResult,
  localResultKey,
  syncProblem,
  uploadOutcomes,
} from "./localResults.ts";
import { toolFailure } from "./index.ts";
import { trackingAnswer } from "./tracking.ts";

const base = {
  prompt: " Best CRM for startups ",
  capturedAt: "2026-11-19T07:02:11.000Z",
  country: "US",
};
const subject = { brand: "Acme", domain: "acme.com", competitors: ["HubSpot"] };

it("maps an answer to the cloud contract, ranking the brand among the brands it names", () => {
  const result = answeredResult(
    { ...base, engine: "perplexity" },
    {
      text: "1. HubSpot – popular\n2. Acme – built for startups, see acme.com",
      links: [
        { url: "https://acme.com/crm", title: "Acme CRM" },
        { url: "https://www.g2.com/categories/crm", title: "Best CRM" },
      ],
    },
    subject,
  );
  expect(localResult(trackingAnswer("p1", result), "Acme")).toEqual({
    prompt: "Best CRM for startups",
    engine: "perplexity",
    country: "US",
    checked_at: "2026-11-19T07:02:11.000Z",
    status: "answered",
    reason: null,
    answer: result.text,
    sources: [
      { url: "https://acme.com/crm", title: "Acme CRM", position: 1 },
      { url: "https://www.g2.com/categories/crm", title: "Best CRM", position: 2 },
    ],
    brand: { mentioned: true, position: 2 },
    domain: { mentioned: true },
    competitors: [{ name: "HubSpot", position: 1 }],
  });
});

it("sends Google AI Overviews with the organic results on the same page, even without an overview", () => {
  const result = answeredResult(
    { ...base, engine: "google_overviews" },
    {
      text: "",
      links: [],
      search: {
        overview: false,
        organic: [
          { url: "https://acme.com/crm", title: "Acme CRM", domain: "acme.com" },
          { url: "https://hubspot.com", title: "HubSpot", domain: "hubspot.com" },
        ],
      },
    },
    subject,
  );
  expect(localResult(trackingAnswer("p1", result), "Acme")).toMatchObject({
    engine: "google_ai_overview",
    status: "answered",
    answer: "",
    sources: [],
    organic_results: [
      { url: "https://acme.com/crm", title: "Acme CRM", position: 1 },
      { url: "https://hubspot.com", title: "HubSpot", position: 2 },
    ],
    brand: { mentioned: false, position: null },
  });
});

it("sends failed checks with their reason, and skips what the cloud cannot take", () => {
  const signedOut = trackingAnswer(
    "p1",
    unansweredResult({ ...base, engine: "chatgpt" }, "logged_out", "chatgpt.com showed sign-in"),
  );
  expect(localResult(signedOut, "Acme")).toEqual({
    prompt: "Best CRM for startups",
    engine: "chatgpt",
    country: "US",
    checked_at: "2026-11-19T07:02:11.000Z",
    status: "logged_out",
    reason: "chatgpt.com showed sign-in",
  });
  const answer = (engine: "google" | "claude" | "gemini") =>
    trackingAnswer("p1", answeredResult({ ...base, engine }, { text: "Acme", links: [] }, subject));
  expect(localResult(answer("google"), "Acme")).toBeNull();
  expect(localResult(answer("claude"), "Acme")).toBeNull();
  expect(localResult(answer("gemini"), "Acme")?.engine).toBe("gemini");
  expect(localResult({ ...answer("gemini"), status: "budget_exhausted" }, "Acme")).toBeNull();
  expect(localResult({ ...answer("gemini"), country: "ZZ" }, "Acme")).toBeNull();
  const { capturedAt: _, ...legacy } = answer("gemini");
  expect(localResult(legacy, "Acme")).toBeNull();
});

it("keys results like the cloud: prompt, engine, country and UTC day", () => {
  const at = (capturedAt: string, prompt = base.prompt) =>
    localResultKey(
      localResult(
        trackingAnswer(
          "p1",
          unansweredResult({ ...base, prompt, capturedAt, engine: "gemini" }, "failed", "x"),
        ),
        "Acme",
      )!,
    );
  expect(at("2026-11-19T01:00:00Z")).toBe(at("2026-11-19T23:00:00Z", "best crm for startups"));
  expect(at("2026-11-19T23:30:00-05:00")).not.toBe(at("2026-11-19T12:00:00Z"));
});

it("settles accepted items, retries transient ones and drops permanent refusals", () => {
  const now = 1_000_000;
  for (const outcome of ["created", "updated", "unchanged"])
    expect(itemDisposition({ index: 0, outcome }, now, 0)).toEqual({ state: "done", outcome });
  expect(itemDisposition({ outcome: "rejected", error_code: "conflict" }, now, 0)).toEqual({
    state: "pending",
    outcome: "conflict",
    at: now + 60_000,
  });
  expect(itemDisposition({ outcome: "rejected", error_code: "store_failed" }, now, 3)).toEqual({
    state: "pending",
    outcome: "store_failed",
    at: now + 8 * 60_000,
  });
  expect(itemDisposition({ outcome: "rejected", error_code: "store_failed" }, now, 30)).toEqual({
    state: "pending",
    outcome: "store_failed",
    at: now + 6 * 3_600_000,
  });
  expect(itemDisposition({ outcome: "retry_later", retry_after: 90 }, now, 0)).toEqual({
    state: "pending",
    outcome: "retry_later",
    at: now + 90_000,
  });
  expect(itemDisposition(undefined, now, 0)).toMatchObject({ state: "pending" });
  for (const code of ["invalid_checked_at", "too_old", "something_new"])
    expect(itemDisposition({ outcome: "rejected", error_code: code }, now, 0)).toEqual({
      state: "dropped",
      outcome: code,
      stopPrompt: false,
    });
  expect(
    itemDisposition({ outcome: "rejected", error_code: "prompt_limit_reached" }, now, 0),
  ).toEqual({ state: "dropped", outcome: "prompt_limit_reached", stopPrompt: true });
});

it("names why a whole upload was refused", () => {
  expect(
    syncProblem(
      toolFailure(
        "`submit_local_results` needs an AmICited subscription. A Pro plan or the trial unlocks every tool.",
      ),
    ),
  ).toBe("no_plan");
  expect(syncProblem(toolFailure("User does not have permission to perform this action"))).toBe(
    "no_edit_rights",
  );
  expect(syncProblem(toolFailure("This tool requires the `amicited:write` scope."))).toBe(
    "no_edit_rights",
  );
  expect(syncProblem(toolFailure("Domain not found"))).toBe("domain_missing");
  expect(syncProblem(toolFailure("Unknown tool: submit_local_results"))).toBe("unsupported");
  expect(syncProblem(toolFailure("this workspace's credits are exhausted"))).toBe("no_credits");
  expect(syncProblem(toolFailure("1 validation error for call[submit_local_results]"))).toBe(
    "malformed",
  );
  expect(syncProblem("fetch failed")).toBe("offline");
  expect(syncProblem("Authentication required")).toBe("signed_out");
  expect(uploadOutcomes({ accepted: 1, rejected: 0, results: [{ index: 0 }] })).toEqual([
    { index: 0 },
  ]);
  expect(uploadOutcomes({ detail: "nope" })).toBeNull();
});

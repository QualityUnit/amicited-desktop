import { answeredResult, unansweredResult } from "@amicited/visibility/result";
import { expect, it } from "vite-plus/test";
import { trackingAnswer, type TrackingRun } from "./tracking.ts";
import { domainVisibility, promptHistory } from "./visibility.ts";

const subject = { brand: "Acme", domain: "acme.com", competitors: ["HubSpot", "Zoho"] };
const answer = (
  prompt: string,
  text: string,
  links: string[],
  engine: "chatgpt" | "gemini" | "google" = "chatgpt",
) =>
  trackingAnswer(
    prompt,
    answeredResult(
      { engine, prompt, capturedAt: "2026-11-19T08:00:00Z", country: "US" },
      { text, links: links.map((url) => ({ url })) },
      subject,
    ),
  );
const run = (day: string, answers: TrackingRun["answers"]): TrackingRun => ({
  id: day,
  projectId: "site",
  day,
  status: "complete",
  total: answers.length,
  answers,
});
const domain = { brand: "Acme", hostname: "acme.com" };

it("measures share of voice and citation like the dashboard, per day and over the window", () => {
  const result = domainVisibility(
    "site",
    [
      run("2026-11-18", [
        answer("a", "HubSpot, then Acme.", ["https://acme.com/x", "https://g2.com/y"]),
        answer("b", "Zoho only.", ["https://zoho.com"]),
      ]),
      run("2026-11-19", [
        answer("a", "Acme leads.", ["https://www.acme.com/", "https://docs.acme.com/z"]),
        // Google AI Mode is hidden, so its answers stay out of every number.
        answer("a", "Zoho only.", ["https://www.google.com/goto?url=x"], "google"),
        trackingAnswer(
          "b",
          unansweredResult(
            { engine: "chatgpt", prompt: "b", capturedAt: "2026-11-19T08:00:00Z", country: "US" },
            "logged_out",
            "x",
          ),
        ),
      ]),
    ],
    domain,
    "2026-11-19",
  );
  expect(result).toMatchObject({
    from: "2026-10-21",
    to: "2026-11-19",
    answers: 3,
    lastDay: "2026-11-19",
    // Acme 2 of 4 mentions (Acme, HubSpot, Zoho, Acme); 3 of 5 links on acme.com.
    shareOfVoice: 50,
    shareOfCitation: 60,
    previousShareOfVoice: null,
    days: [
      { day: "2026-11-18", shareOfVoice: 33.3, shareOfCitation: 33.3 },
      { day: "2026-11-19", shareOfVoice: 100, shareOfCitation: 100 },
    ],
    brandCount: 3,
    brands: [
      { name: "Acme", share: 50, rank: 1, you: true },
      { name: "HubSpot", share: 25, rank: 2, you: false },
      { name: "Zoho", share: 25, rank: 3, you: false },
    ],
    mentioned: 2,
    mentionRate: 66.7,
    engines: [{ engine: "chatgpt", answers: 3, mentioned: 2, mentionRate: 66.7, cited: 2 }],
    prompts: [
      {
        promptId: "a",
        answers: 2,
        mentioned: 2,
        namedInstead: null,
        latest: [{ engine: "chatgpt", status: "answered", mentioned: true }],
      },
      {
        promptId: "b",
        answers: 1,
        mentioned: 0,
        namedInstead: "Zoho",
        // The newest check failed; it still shows, though only answered checks count.
        latest: [{ engine: "chatgpt", status: "needs_sign_in", mentioned: false }],
      },
    ],
    totalCitations: 5,
    sources: [
      { domain: "acme.com", citations: 3, share: 60, you: true },
      { domain: "g2.com", citations: 1, share: 20, you: false },
      { domain: "zoho.com", citations: 1, share: 20, you: false },
    ],
    citedPageCount: 3,
  });
});

it("counts a rerun's latest answer once and splits the previous window", () => {
  const result = domainVisibility(
    "site",
    [
      run("2026-10-01", [answer("a", "Acme.", ["https://acme.com"])]),
      run("2026-11-19", [answer("a", "HubSpot.", ["https://hubspot.com"])]),
      run("2026-11-19", [answer("a", "1. HubSpot\n2. Acme", ["https://g2.com"])]),
    ],
    domain,
    "2026-11-19",
  );
  expect(result).toMatchObject({
    answers: 1,
    shareOfVoice: 50,
    shareOfCitation: 0,
    previousShareOfVoice: 100,
    previousShareOfCitation: 100,
    mentionRate: 100,
    previousMentionRate: 100,
    positioned: 1,
    averagePosition: 2,
    brands: [
      { name: "Acme", share: 50, previousShare: 100 },
      { name: "HubSpot", share: 50, previousShare: null },
    ],
  });
});

it("reports no measurement, not zero, before any answer", () => {
  expect(domainVisibility("site", [], domain, "2026-11-19")).toMatchObject({
    answers: 0,
    lastDay: null,
    shareOfVoice: null,
    shareOfCitation: null,
    days: [],
    brands: [],
  });
});

const unanswered = (prompt: string, engine: "chatgpt" | "gemini", reason: string) =>
  trackingAnswer(
    prompt,
    unansweredResult(
      { engine, prompt, capturedAt: "2026-11-19T08:00:00Z", country: "US" },
      "failed",
      reason,
    ),
  );

it("lets an answered check win its day and engine, whichever order the runs came in", () => {
  const result = promptHistory(
    "site",
    "a",
    [
      run("2026-11-18", [unanswered("a", "chatgpt", "Timed out")]),
      run("2026-11-18", [
        answer("a", "1. HubSpot\n2. Acme", ["https://acme.com/x"]),
        answer("b", "Acme.", []),
      ]),
      run("2026-11-18", [unanswered("a", "chatgpt", "Prompt box missing")]),
    ],
    domain,
    "2026-11-19",
  );
  expect(result).toMatchObject({
    from: "2026-10-21",
    to: "2026-11-19",
    history: [
      {
        day: "2026-11-18",
        engine: "chatgpt",
        status: "answered",
        mentioned: true,
        position: 2,
        cited: true,
      },
    ],
  });
  // The newest check failed, so the answer that did come back is kept next to it.
  expect(result.latest.map((l) => l.answer.status)).toEqual(["failed"]);
  expect(result.lastAnswered.map((l) => l.answer.text)).toEqual(["1. HubSpot\n2. Acme"]);
});

it("keeps the last answer per engine when the latest check failed, and only then", () => {
  const result = promptHistory(
    "site",
    "a",
    [
      run("2026-11-18", [
        answer("a", "Acme leads.", [], "chatgpt"),
        answer("a", "HubSpot only.", [], "gemini"),
      ]),
      run("2026-11-19", [
        unanswered("a", "chatgpt", "Prompt box missing"),
        answer("a", "Zoho only.", [], "gemini"),
      ]),
    ],
    domain,
    "2026-11-19",
  );
  expect(result.history).toMatchObject([
    { day: "2026-11-18", engine: "chatgpt", mentioned: true },
    { day: "2026-11-18", engine: "gemini", mentioned: false },
    {
      day: "2026-11-19",
      engine: "chatgpt",
      status: "failed",
      mentioned: false,
      reason: "Prompt box missing",
    },
    { day: "2026-11-19", engine: "gemini", status: "answered", mentioned: false },
  ]);
  expect(result.latest).toMatchObject([
    { day: "2026-11-19", answer: { engine: "chatgpt", status: "failed" } },
    { day: "2026-11-19", answer: { engine: "gemini", text: "Zoho only." } },
  ]);
  expect(result.lastAnswered).toMatchObject([
    { day: "2026-11-18", answer: { engine: "chatgpt", text: "Acme leads." } },
  ]);
});

it("returns an empty history for a prompt with no checks in the window", () => {
  expect(
    promptHistory(
      "site",
      "a",
      [
        run("2026-10-01", [answer("a", "Acme.", [])]),
        run("2026-11-19", [answer("b", "Acme.", [])]),
      ],
      domain,
      "2026-11-19",
    ),
  ).toEqual({
    projectId: "site",
    promptId: "a",
    from: "2026-10-21",
    to: "2026-11-19",
    history: [],
    latest: [],
    lastAnswered: [],
  });
});

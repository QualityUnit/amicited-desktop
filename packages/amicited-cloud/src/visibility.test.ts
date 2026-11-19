import { answeredResult, unansweredResult } from "@amicited/visibility/result";
import { expect, it } from "vite-plus/test";
import { trackingAnswer, type TrackingRun } from "./tracking.ts";
import { domainVisibility } from "./visibility.ts";

const subject = { brand: "Acme", domain: "acme.com", competitors: ["HubSpot", "Zoho"] };
const answer = (prompt: string, text: string, links: string[], engine = "chatgpt" as const) =>
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
    brands: [
      { name: "Acme", share: 50, you: true },
      { name: "HubSpot", share: 25, you: false },
      { name: "Zoho", share: 25, you: false },
    ],
  });
});

it("counts a rerun's latest answer once and splits the previous window", () => {
  const result = domainVisibility(
    "site",
    [
      run("2026-10-01", [answer("a", "Acme.", ["https://acme.com"])]),
      run("2026-11-19", [answer("a", "HubSpot.", ["https://hubspot.com"])]),
      run("2026-11-19", [answer("a", "Acme.", ["https://g2.com"])]),
    ],
    domain,
    "2026-11-19",
  );
  expect(result).toMatchObject({
    answers: 1,
    shareOfVoice: 100,
    shareOfCitation: 0,
    previousShareOfVoice: 100,
    previousShareOfCitation: 100,
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

import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { answeredResult, unansweredResult, VisibilityResult, type RawAnswer } from "./result.ts";

const base = {
  engine: "perplexity" as const,
  prompt: "Best analytics tools?",
  capturedAt: "2026-11-19T09:00:00.000Z",
  country: "SK",
};
const subject = { brand: "Northwind Analytics", domain: "www.northwind.io", competitors: ["Heap"] };
const answers: RawAnswer[] = [
  {
    text: "1. **Mixpanel**: Strong funnels.\n2. **Northwind Analytics**: Simple setup at northwind.io.\n3. **Amplitude**: Retention.\nHeap is also popular.\n- Pricing: Free plan.\n- Pricing: Paid plans.",
    links: [
      { url: "https://northwind.io/pricing#:~:text=Plans", title: " Pricing " },
      { url: "https://www.google.com/url?q=https://mixpanel.com/&sa=U", title: "Mixpanel" },
      { url: "https://northwind.io/pricing", title: "Duplicate" },
      { url: "javascript:void(0)", title: "Not a source" },
      { url: "https://docs.northwind.io/start", title: "Docs" },
    ],
  },
  { text: "Try NotNorthwind Analytics2 instead.", links: [] },
  { text: "", links: [] },
];

const isResult = Schema.is(VisibilityResult);
function expectInvariants(result: VisibilityResult) {
  expect(isResult(result)).toBe(true);
  expect(result.reason === null).toBe(result.status === "answered");
  if (result.status !== "answered") {
    expect(result.text).toBe("");
    expect(result.sources).toEqual([]);
    expect(result.brand.mentioned || result.domain.mentioned).toBe(false);
    expect(result.competitors).toEqual([]);
  }
  expect(result.sources.map((s) => s.position)).toEqual(result.sources.map((_, i) => i + 1));
  expect(new Set(result.sources.map((s) => s.url)).size).toBe(result.sources.length);
  expect(result.sources.every((s) => /^https?:\/\//.test(s.url))).toBe(true);
  for (const mention of [result.brand, result.domain]) {
    expect(mention.mentioned).toBe(mention.offsets.length > 0);
    expect(mention.offsets.every((o) => o >= 0 && o < result.text.length)).toBe(true);
  }
  if (result.brand.listPosition !== null)
    expect(result.brand.mentioned || result.domain.mentioned).toBe(true);
  for (const position of result.domain.citedAt)
    expect(result.sources[position - 1]?.domain.endsWith("northwind.io")).toBe(true);
  expect(result.competitors).not.toContain(subject.brand);
}

describe("visibility results", () => {
  it("hold their invariants for every answer and status", () => {
    for (const answer of answers) expectInvariants(answeredResult(base, answer, subject));
    for (const status of ["blocked", "logged_out", "failed"] as const)
      expectInvariants(unansweredResult(base, status, "  "));
  });

  it("locate the brand, its domain, citations and competitors", () => {
    const result = answeredResult(base, answers[0]!, subject);
    const text = answers[0]!.text;
    expect(result.brand).toEqual({
      mentioned: true,
      offsets: [text.indexOf("Northwind Analytics")],
      listPosition: 2,
    });
    expect(result.domain.offsets).toEqual([text.indexOf("northwind.io")]);
    expect(result.sources.map((s) => [s.position, s.domain, s.title])).toEqual([
      [1, "northwind.io", "Pricing"],
      [2, "mixpanel.com", "Mixpanel"],
      [3, "docs.northwind.io", "Docs"],
    ]);
    expect(result.domain.citedAt).toEqual([1, 3]);
    expect(result.competitors).toEqual(["Heap", "Mixpanel", "Amplitude"]);
    expect(answeredResult(base, answers[1]!, subject).brand.mentioned).toBe(false);
  });
});

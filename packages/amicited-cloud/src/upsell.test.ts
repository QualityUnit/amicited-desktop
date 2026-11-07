import { domainNames } from "./model.ts";
import { expect, it } from "vite-plus/test";
import {
  createUpsellGate,
  whatYouAreMissing,
  shouldOfferUpsell,
  snoozeUpsell,
  promotionEligible,
} from "./upsell.ts";
const win = {
  status: "success",
  tool: "ai.visibility.check",
  output: {
    scope: {
      assistants: ["Claude"],
      countries: ["SK"],
      prompts: ["Where to buy?"],
      runAt: "2026-11-06T00:00:00Z",
    },
  },
};
it("compares only measured scope and never treats failures as a win", () => {
  expect(whatYouAreMissing(win)?.checked).toBe("You completed a one-time Claude visibility check.");
  expect(whatYouAreMissing(win)?.teaser).toBe("ChatGPT · Perplexity · Gemini · not checked");
  for (const [id, name] of [
    ["codex", "ChatGPT"],
    ["claudeAgent", "Claude"],
  ]) {
    const offer = whatYouAreMissing({
      ...win,
      output: { ...win.output, scope: { ...win.output.scope, assistants: [id] } },
    });
    expect(offer?.checked).toBe(`You completed a one-time ${name} visibility check.`);
    expect(offer?.teaser).not.toContain(name);
  }
  expect(
    whatYouAreMissing({
      ...win,
      input: { brand: "Acme" },
      output: { ...win.output, summary: { mentioned: 1, answered: 2 } },
    })?.checked,
  ).toContain("Acme was named in 1 of 2 Claude answers in this check.");
  expect(
    whatYouAreMissing({ ...win, tool: "seo.site.audit", output: { status: "checked", score: 41 } })
      ?.checked,
  ).toContain("41/100");
  expect(whatYouAreMissing({ ...win, output: {} })).toBeUndefined();
  for (const output of [
    { status: "ready", draft: "  " },
    { words: 0, sentences: 0 },
    { status: "could_not_check" },
    { status: "could_not_generate" },
    { status: "partial", summary: { answered: 0 } },
    { status: "partial", groups: [{ result: { status: "could_not_check" } }] },
  ])
    expect(whatYouAreMissing({ ...win, output })).toBeUndefined();
  expect(whatYouAreMissing({ ...win, status: "error" })).toBeUndefined();
  expect(whatYouAreMissing({ ...win, output: { status: "needs_provider" } })).toBeUndefined();
  expect(whatYouAreMissing({ ...win, tool: "seo.ssl.check" })).toBeUndefined();
  expect(whatYouAreMissing({ ...win, tool: "site.audit" })?.missing).toContain("actually cite you");
  expect(whatYouAreMissing({ ...win, tool: "content.brief" })?.missing).toContain("citation-gap");
});
it("persists seven-day snooze and dismissal and admits at most one win per session", () => {
  const store = () => {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
  };
  const unavailable = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  expect(createUpsellGate(unavailable, unavailable).claim(win, 0)).toBe(false);
  expect(() => createUpsellGate(unavailable, unavailable).snooze(0)).not.toThrow();
  const persistent = store();
  const session = store();
  const gate = createUpsellGate(persistent, session);
  for (const [firstWin, preferences, connected, eligible] of [
    [false, {}, false, false],
    [true, {}, false, true],
    [true, { dismissed: true }, false, false],
    [true, { snoozedUntil: 100 }, false, false],
    [true, {}, true, false],
  ] as const)
    expect(promotionEligible(firstWin, preferences, 0, connected)).toBe(eligible);
  expect(gate.claim(win, 0, true)).toBe(false);
  expect(gate.claim({ ...win, status: "error" }, 0)).toBe(false);
  expect(gate.claim(win, 0)).toBe(true);
  expect(createUpsellGate(persistent, session).claim(win, 0)).toBe(false);
  gate.snooze(0);
  const nextSession = createUpsellGate(persistent, store());
  expect(nextSession.claim(win, 6 * 86400000)).toBe(false);
  expect(nextSession.claim(win, 7 * 86400000)).toBe(true);
  expect(nextSession.hidden()).toBe(false);
  expect(nextSession.dismiss()).toBe(true);
  expect(createUpsellGate(persistent, store()).hidden()).toBe(true);
  expect(createUpsellGate(unavailable, unavailable).dismiss()).toBe(false);
  expect(createUpsellGate(persistent, store()).claim(win, 99 * 86400000)).toBe(false);
  expect(shouldOfferUpsell(win, snoozeUpsell(0), false, 7 * 86400000)).toBe(true);
});

it("maps the server domain summary objects to visible domain names", () => {
  expect(
    domainNames([
      { id: "domain-1", name: "example.com" },
      { id: "domain-2", name: "acme.com" },
    ]),
  ).toEqual(["example.com", "acme.com"]);
  expect(domainNames(undefined)).toEqual([]);
});

it("preserves the winning result's offer across transcript remounts and keeps snooze authoritative", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const gate = createUpsellGate(storage, storage);
  const result = { ...win, id: "visibility-result" };
  expect(gate.claim(result, 0)).toBe(true);
  expect(createUpsellGate(storage, storage).claim(result, 0)).toBe(true);
  expect(gate.claim({ ...result, id: "second-result" }, 0)).toBe(false);
  gate.snooze(0);
  expect(gate.claim(result, 1)).toBe(false);
});

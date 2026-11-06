import { domainNames } from "./model.ts";
import { expect, it } from "vite-plus/test";
import { createUpsellGate, whatYouAreMissing, shouldOfferUpsell, snoozeUpsell } from "./upsell.ts";
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
  expect(whatYouAreMissing(win)?.checked).toContain(
    "1 assistant (Claude), 1 prompt, from this machine, now",
  );
  expect(whatYouAreMissing(win)?.checked).toContain("1 prompt");
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

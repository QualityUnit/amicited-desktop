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
  expect(whatYouAreMissing(win)?.checked).toContain("1 assistant (Claude) from 1 country, once");
  expect(whatYouAreMissing(win)?.checked).toContain("1 prompt");
  expect(whatYouAreMissing({ ...win, output: {} })?.checked).not.toContain("Claude");
  expect(whatYouAreMissing({ ...win, status: "error" })).toBeUndefined();
  expect(whatYouAreMissing({ ...win, tool: "seo.ssl.check" })).toBeUndefined();
  expect(whatYouAreMissing({ ...win, tool: "site.audit" })?.missing).toContain("uptime");
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
  nextSession.dismiss();
  expect(createUpsellGate(persistent, store()).claim(win, 99 * 86400000)).toBe(false);
  expect(shouldOfferUpsell(win, snoozeUpsell(0), false, 7 * 86400000)).toBe(true);
});

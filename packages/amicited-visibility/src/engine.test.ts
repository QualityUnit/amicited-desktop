import { describe, expect, it } from "vite-plus/test";
import type { EngineContext } from "./engine.ts";
import { FakePage, fakeEngine, type FakeSite } from "./testing.ts";

const context = (): EngineContext & { elapsed: () => number } => {
  let now = Date.parse("2026-11-19T09:00:00Z");
  const start = now;
  return {
    signal: new AbortController().signal,
    now: () => new Date(now),
    sleep: async (ms) => {
      now += ms;
    },
    random: () => 0.5,
    elapsed: () => now - start,
  };
};
const query = { prompt: "Best tools?", brand: "Northwind", domain: "northwind.io", country: "SK" };
const run = (site: FakeSite, requiresLogin = false) => {
  const page = new FakePage(site);
  const ctx = context();
  return fakeEngine("perplexity", { requiresLogin })
    .run(page, query, ctx)
    .then((result) => ({ result, page, ctx }));
};

describe("engine runs", () => {
  it("waits for a streamed answer to settle before extracting it", async () => {
    const { result, page } = await run({
      answer: { text: "1. Northwind\n2. Acme", links: [{ url: "https://northwind.io/" }] },
      streamingReads: 4,
      loggedIn: true,
    });
    expect(result.status).toBe("answered");
    expect(result.text).toBe("1. Northwind\n2. Acme");
    expect(result.brand.listPosition).toBe(1);
    expect(result.domain.citedAt).toEqual([1]);
    expect(result.session).toBe("logged_in");
    expect(result.pageUrl).toBe("https://www.perplexity.ai/");
    expect(page.log).toEqual([
      "goto https://www.perplexity.ai/",
      "type #fake-input Best tools?",
      "press #fake-input",
    ]);
  });

  it("classifies challenges, sign-in walls and failures without throwing", async () => {
    expect((await run({ state: "captcha" })).result).toMatchObject({
      status: "blocked",
      reason: expect.stringContaining("CAPTCHA"),
    });
    expect((await run({ state: "captcha_after_ask" })).result.status).toBe("blocked");
    expect((await run({ state: "logged_out" }, true)).result).toMatchObject({
      status: "logged_out",
      session: "logged_out",
    });
    expect(
      (await run({ state: "logged_out", answer: { text: "Answer", links: [] } })).result.status,
    ).toBe("answered");
    expect((await run({ failNavigation: true })).result).toMatchObject({
      status: "failed",
      reason: "Navigation failed",
    });
    const silent = await run({});
    expect(silent.result).toMatchObject({
      status: "failed",
      reason: expect.stringMatching(/no answer/),
    });
    expect(silent.ctx.elapsed()).toBeLessThan(10_000);
  });

  it("stops at cancellation instead of returning a result", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fakeEngine("chatgpt").run(new FakePage({}), query, {
        ...context(),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

import { expect, it } from "vite-plus/test";
import { FakePage, type FakeSite } from "@amicited/visibility/testing";
import { BrowserConnections, classifyProbe } from "./connections.ts";
function fixture() {
  let site: FakeSite = { loggedIn: true };
  const closed: string[] = [];
  const cleared: string[][] = [];
  const engine = new BrowserConnections({
    open: async (id) => ({
      page: new FakePage(site),
      close: async () => {
        closed.push(id);
      },
    }),
    clearCookies: async (domains) => {
      cleared.push([...domains]);
    },
  });
  return {
    engine,
    closed,
    cleared,
    setSite: (value: FakeSite) => {
      site = value;
    },
  };
}
it("classifies conflicting markers conservatively", () => {
  expect(classifyProbe({ loggedIn: true, loggedOut: false, captcha: false })).toBe("logged_in");
  expect(classifyProbe({ loggedIn: true, loggedOut: true, captcha: false })).toBe("logged_out");
  expect(classifyProbe({ loggedIn: true, loggedOut: true, captcha: true })).toBe("captcha");
  expect(classifyProbe({ loggedIn: false, loggedOut: false, captcha: false })).toBe("unknown");
});
it("completes or cancels sign-in, tracks logout and clears only site cookies", async () => {
  const f = fixture();
  const row = () => f.engine.snapshot().connections.find((r) => r.id === "chatgpt")!;
  expect(row().status).toBe("not_set_up");
  await f.engine.connect("chatgpt", "thread");
  expect(row().signingIn).toBe(true);
  await f.engine.finish("chatgpt");
  expect(row()).toMatchObject({ status: "connected", signingIn: false });
  f.setSite({ state: "logged_out" });
  await f.engine.check("chatgpt");
  expect(row().status).toBe("needs_attention");
  await f.engine.withSiteSession("chatgpt", async () => ({ value: null, probe: "captcha" }));
  expect(row().status).toBe("needs_attention");
  await f.engine.connect("chatgpt", "thread");
  await f.engine.cancel("chatgpt");
  expect(row().signingIn).toBe(false);
  await f.engine.disconnect("chatgpt");
  expect(row().status).toBe("signed_out");
  expect(f.cleared).toEqual([["chatgpt.com", "openai.com"]]);
});
it("serialises a site's work while another site continues and recovers after errors", async () => {
  const { engine, closed } = fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const order: string[] = [];
  const a = engine.withSiteSession("chatgpt", async () => {
    order.push("a");
    entered.resolve();
    await release.promise;
    return { value: 1, probe: null };
  });
  await entered.promise;
  const b = engine.withSiteSession("chatgpt", async () => {
    order.push("b");
    return { value: 2, probe: null };
  });
  await engine.withSiteSession("google", async () => {
    order.push("google");
    return { value: 0, probe: null };
  });
  expect(order).toEqual(["a", "google"]);
  release.resolve();
  await Promise.all([a, b]);
  expect(order).toEqual(["a", "google", "b"]);
  await expect(
    engine.withSiteSession("chatgpt", async () => {
      throw new Error("failure");
    }),
  ).rejects.toThrow("failure");
  expect(closed.filter((id) => id === "chatgpt")).toHaveLength(3);
  expect(await engine.withSiteSession("chatgpt", async () => ({ value: 3, probe: null }))).toBe(3);
});
it("replaces dependencies by identity, removes them, and resolves chat requests on sign-in", async () => {
  const { engine } = fixture();
  engine.registerUsage("google", { id: "tracking:a", label: "Tracking a" });
  engine.registerUsage("google", { id: "tracking:a", label: "Tracking a: 12 prompts" });
  engine.registerUsage("google", { id: "tracking:b", label: "Tracking b" });
  engine.unregisterUsage("google", "tracking:b");
  expect(engine.snapshot().connections.find((r) => r.id === "google")?.usedBy).toEqual([
    { id: "tracking:a", label: "Tracking a: 12 prompts" },
  ]);
  engine.requestConnection("t", "google", "Reconnect Google");
  engine.requestConnection("t", "google", "Reconnect Google");
  expect(engine.snapshot().requests).toHaveLength(1);
  await engine.connect("google", "t");
  await engine.finish("google");
  expect(engine.snapshot().requests).toEqual([]);
  await expect(
    engine.withSiteSession("linkedin", async () => ({ value: null, probe: null })),
  ).rejects.toThrow("coming soon");
});

it("restores metadata without reviving an abandoned sign-in tab", async () => {
  const first = fixture();
  first.engine.registerUsage("google", { id: "tracking:a", label: "Tracking a" });
  await first.engine.withSiteSession("google", async () => ({ value: 1, probe: "logged_in" }));
  await first.engine.connect("google", "old-thread");
  const second = fixture();
  second.engine.restore(first.engine.snapshot().connections);
  expect(second.engine.snapshot().connections.find((r) => r.id === "google")).toMatchObject({
    status: "connected",
    signingIn: false,
    lastUsed: expect.any(String),
    usedBy: [{ id: "tracking:a", label: "Tracking a" }],
  });
  expect(second.engine.snapshot().connections.find((r) => r.id === "google")).not.toHaveProperty(
    "threadId",
  );
});
it("closes the active page when collection is cancelled", async () => {
  const entered = Promise.withResolvers<void>();
  const blocked = Promise.withResolvers<void>();
  let closed = 0;
  const engine = new BrowserConnections({
    open: async () => ({
      page: new FakePage({ loggedIn: true }),
      close: async () => {
        closed++;
        blocked.reject(new Error("Page closed"));
      },
    }),
    clearCookies: async () => {},
  });
  const controller = new AbortController();
  const result = engine.withSiteSession(
    "chatgpt",
    async () => {
      entered.resolve();
      await blocked.promise;
      return { value: null, probe: null };
    },
    controller.signal,
  );
  const rejected = expect(result).rejects.toThrow("Page closed");
  await entered.promise;
  controller.abort();
  await rejected;
  expect(closed).toBeGreaterThan(0);
});

import { expect, it } from "vite-plus/test";
import { BrowserConnections, classifyProbe, siteAdapters, type SitePage } from "./connections.ts";
function fixture() {
  let marker = "logged_in";
  const closed: string[] = [];
  const cleared: string[][] = [];
  const engine = new BrowserConnections({
    open: async (id) => {
      const page: SitePage = {
        goto: async () => {},
        close: async () => {},
        locator: (selector) => ({
          first: () => ({
            isVisible: async () =>
              marker === "logged_in"
                ? selector === siteAdapters[id].loggedIn
                : marker === "logged_out"
                  ? selector === siteAdapters[id].loggedOut
                  : marker === "captcha" && selector.includes("#captcha"),
          }),
        }),
      };
      return {
        page,
        close: async () => {
          closed.push(id);
        },
      };
    },
    clearCookies: async (domains) => {
      cleared.push([...domains]);
    },
  });
  return {
    engine,
    closed,
    cleared,
    setMarker: (value: string) => {
      marker = value;
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
  f.setMarker("logged_out");
  await f.engine.check("chatgpt");
  expect(row().status).toBe("needs_attention");
  f.setMarker("captcha");
  expect(
    await f.engine.withSiteSession("chatgpt", async () => {
      throw new Error("must not run");
    }),
  ).toEqual({ status: "needs_sign_in", reason: "captcha" });
  await f.engine.connect("chatgpt", "thread");
  await f.engine.cancel("chatgpt");
  expect(row().signingIn).toBe(false);
  await f.engine.disconnect("chatgpt");
  expect(row().status).toBe("signed_out");
  expect(f.cleared).toEqual([["chatgpt.com", "openai.com"]]);
});
it("serialises a site's work while another site continues and recovers after errors", async () => {
  const { engine } = fixture();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const order: string[] = [];
  const a = engine.withSiteSession("chatgpt", async () => {
    order.push("a");
    entered.resolve();
    await release.promise;
    return 1;
  });
  await entered.promise;
  const b = engine.withSiteSession("chatgpt", async () => {
    order.push("b");
    return 2;
  });
  await engine.withSiteSession("google", async () => {
    order.push("google");
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
  expect(await engine.withSiteSession("chatgpt", async () => 3)).toEqual({
    status: "ok",
    value: 3,
  });
});
it("turns logout during an action into a sign-in result and closes the page", async () => {
  const f = fixture();
  expect(
    await f.engine.withSiteSession("chatgpt", async () => {
      f.setMarker("logged_out");
      throw new Error("logged out");
    }),
  ).toEqual({ status: "needs_sign_in", reason: "logged_out" });
  expect(f.closed).toEqual(["chatgpt"]);
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
  await expect(engine.withSiteSession("linkedin", async () => {})).rejects.toThrow("coming soon");
});

it("restores metadata without reviving an abandoned sign-in tab", async () => {
  const first = fixture();
  first.engine.registerUsage("google", { id: "tracking:a", label: "Tracking a" });
  await first.engine.withSiteSession("google", async () => 1);
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

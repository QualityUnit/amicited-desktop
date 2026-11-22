import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import * as Layer from "effect/Layer";
import * as ServerConfig from "../../config.ts";
import { PreviewBrowserSandboxError } from "../../preview/PreviewBrowserHost.ts";
import { ServerBrowser, ServerBrowserLaunchError } from "../../preview/ServerBrowser.ts";
import { ExternalLauncher } from "../../process/externalLauncher.ts";
import { ProcessRunner } from "../../processRunner.ts";
import { BrowserBridge, type BridgeConnection } from "./BrowserBridge.ts";
import * as BrowserSessions from "./BrowserSessions.ts";

const firefox: BridgeConnection = {
  info: {
    browser: "Firefox 156.0",
    family: "firefox",
    extensionVersion: "0.1.0",
    scripts: new Set(),
  },
  call: async () => ({ tabId: 3 }),
};

const page = { isClosed: () => false, close: async () => {} } as never;

it.effect("signs in and checks in the desktop app's browser, or the server's without one", () => {
  const opened: string[] = [];
  const sessions = (desktop: boolean) =>
    BrowserSessions.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(BrowserBridge, {
            port: 47615,
            current: Effect.succeed(firefox),
            awaitConnection: () => Effect.succeed(firefox),
            subscribe: () => () => {},
          }),
          Layer.mock(ServerBrowser)({
            connectionPage: Effect.sync(() =>
              desktop ? (opened.push("hidden"), { page, close: async () => {} }) : null,
            ),
            connectionTab: () =>
              Effect.sync(() => {
                opened.push("visible");
                return { page, tabId: "tab-1", close: Effect.void };
              }),
            connectionContext: Effect.sync(() => {
              opened.push("server");
              return { newPage: async () => page } as never;
            }),
          }),
          Layer.mock(ExternalLauncher)({ launchBrowser: () => Effect.void }),
          Layer.mock(ProcessRunner)({
            run: () => Effect.succeed({ code: 0, stdout: "" } as never),
          }),
          Layer.succeed(HostProcess.Platform, "linux"),
        ),
      ),
    );
  return Effect.gen(function* () {
    const inApp = yield* BrowserSessions.BrowserSessions.pipe(
      Effect.flatMap((s) =>
        Effect.all([s.open("chatgpt"), s.open("chatgpt", "amicited-connections"), s.mode]),
      ),
      Effect.provide(Layer.fresh(sessions(true))),
    );
    assert.deepEqual(
      [inApp[0].page.driver, inApp[1].tabId, inApp[2].use, inApp[2].connector],
      ["managed", "tab-1", "app", "Firefox 156.0"],
    );
    yield* BrowserSessions.BrowserSessions.pipe(
      Effect.flatMap((s) => s.open("chatgpt")),
      Effect.provide(Layer.fresh(sessions(false))),
    );
    assert.deepEqual(opened, ["hidden", "visible", "server"]);
  }).pipe(
    Effect.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "browser-sessions-" }).pipe(
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  );
});

it.effect("uses the connector once chosen, remembers it, and relaunches the browser for it", () => {
  let connector: BridgeConnection | null = null;
  let reconnects = true;
  const launched: string[] = [];
  let defaultBrowser = "firefox_firefox.desktop";
  const sessions = BrowserSessions.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(BrowserBridge, {
          port: 47615,
          current: Effect.sync(() => connector),
          awaitConnection: () =>
            Effect.sync(() => {
              if (reconnects) connector = firefox;
              return connector;
            }),
          subscribe: () => () => {},
        }),
        Layer.mock(ServerBrowser)({
          connectionPage: Effect.succeed({ page, close: async () => {} }),
        }),
        Layer.mock(ExternalLauncher)({
          launchBrowser: (url) => Effect.sync(() => void launched.push(url)),
        }),
        Layer.mock(ProcessRunner)({
          run: () => Effect.sync(() => ({ code: 0, stdout: `${defaultBrowser}\n` }) as never),
        }),
        Layer.succeed(HostProcess.Platform, "linux"),
      ),
    ),
  );
  const session = <A, E>(
    f: (s: typeof BrowserSessions.BrowserSessions.Service) => Effect.Effect<A, E>,
  ) =>
    BrowserSessions.BrowserSessions.pipe(Effect.flatMap(f), Effect.provide(Layer.fresh(sessions)));
  return Effect.gen(function* () {
    const unseen = yield* session((s) =>
      Effect.zip(s.mode, s.open("perplexity").pipe(Effect.map((tab) => tab.page.driver))),
    );
    assert.equal(unseen[0].connectorSetup, "Install the AmICited Connector in Firefox.");
    assert.deepEqual([unseen[1], launched], ["managed", []]);

    yield* session((s) =>
      Effect.gen(function* () {
        yield* s.use("connector");
        connector = firefox;
        assert.equal((yield* s.open("perplexity")).page.browser, "Firefox 156.0");
        assert.equal((yield* s.mode).use, "connector");
      }),
    );

    connector = null;
    const relaunched = yield* session((s) => s.open("perplexity"));
    assert.equal(relaunched.page.driver, "extension");
    assert.deepEqual(launched, ["http://127.0.0.1:47615/"]);

    // A connector in a browser that is not the default reconnects on its own; wait for it.
    connector = null;
    defaultBrowser = "google-chrome.desktop";
    const reconnected = yield* session((s) => s.open("perplexity"));
    assert.equal(reconnected.page.driver, "extension");
    assert.deepEqual(launched, ["http://127.0.0.1:47615/"]);

    // A chosen connector that never connects fails the ask instead of using other sign-ins.
    connector = null;
    reconnects = false;
    const error = yield* session((s) => Effect.flip(s.open("perplexity")));
    assert.include(error.message, "not connected");
  }).pipe(
    Effect.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "browser-sessions-" }).pipe(
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  );
});

it.effect("signs out of a site by deleting only its cookies in the desktop app's profile", () => {
  const deleted: string[] = [];
  const cookies = [
    { name: "a", domain: ".chatgpt.com", path: "/" },
    { name: "b", domain: "auth.openai.com", path: "/" },
    { name: "c", domain: "notchatgpt.com", path: "/" },
    { name: "d", domain: ".google.com", path: "/" },
  ];
  const cdp = {
    send: async (method: string, params?: { domain: string }) => {
      if (method === "Network.getAllCookies") return { cookies };
      deleted.push(params!.domain);
      return {};
    },
  };
  const hidden = { context: () => ({ newCDPSession: async () => cdp }) };
  return BrowserSessions.BrowserSessions.pipe(
    Effect.flatMap((s) => s.clearCookies(["chatgpt.com", "openai.com"])),
    Effect.map(() => assert.deepEqual(deleted, [".chatgpt.com", "auth.openai.com"])),
    Effect.provide(
      managedOnly(
        Effect.die("unused"),
        Effect.succeed({ page: hidden as never, close: async () => {} }),
      ),
    ),
  );
});

const managedOnly = (
  connectionContext: ServerBrowser["Service"]["connectionContext"],
  connectionPage: ServerBrowser["Service"]["connectionPage"] = Effect.succeed(null),
) =>
  BrowserSessions.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(BrowserBridge, {
          port: 47615,
          current: Effect.succeed(null),
          awaitConnection: () => Effect.succeed(null),
          subscribe: () => () => {},
        }),
        Layer.mock(ServerBrowser)({ connectionContext, connectionPage }),
        Layer.mock(ExternalLauncher)({ launchBrowser: () => Effect.void }),
        Layer.mock(ProcessRunner)({
          run: () => Effect.succeed({ code: 0, stdout: "" } as never),
        }),
        Layer.succeed(HostProcess.Platform, "linux"),
      ),
    ),
    Layer.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "browser-sessions-" }).pipe(
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
  );

it.effect("says how to fix a managed browser the host's sandbox blocks", () =>
  BrowserSessions.BrowserSessions.pipe(
    Effect.flatMap((s) => Effect.flip(s.open("chatgpt"))),
    Effect.map((error) => assert.include(error.message, "`t3 browser setup`")),
    Effect.provide(
      managedOnly(
        Effect.fail(
          new ServerBrowserLaunchError({
            cause: new PreviewBrowserSandboxError({ setupCommand: "t3 browser setup" }),
          }),
        ),
      ),
    ),
  ),
);

it.effect("gives up on a managed browser that never starts", () =>
  Effect.gen(function* () {
    const sessions = yield* BrowserSessions.BrowserSessions;
    const opening = yield* Effect.forkChild(Effect.flip(sessions.open("chatgpt")));
    yield* TestClock.adjust("1 minute");
    const error = yield* Fiber.join(opening);
    assert.include(error.message, "did not start");
  }).pipe(Effect.provide(managedOnly(Effect.never))),
);

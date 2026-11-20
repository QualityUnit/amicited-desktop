import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
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

it.effect(
  "uses the connector when present, remembers it, and relaunches the browser for it",
  () => {
    let connector: BridgeConnection | null = null;
    const launched: string[] = [];
    const managedPages: string[] = [];
    const sessions = BrowserSessions.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          Layer.succeed(BrowserBridge, {
            port: 47615,
            current: Effect.sync(() => connector),
            awaitConnection: () =>
              Effect.sync(() => {
                connector = firefox;
                return connector;
              }),
            subscribe: () => () => {},
          }),
          Layer.mock(ServerBrowser)({
            connectionContext: Effect.succeed({
              newPage: async () => {
                managedPages.push("page");
                return { isClosed: () => false, close: async () => {} };
              },
            } as never),
          }),
          Layer.mock(ExternalLauncher)({
            launchBrowser: (url) => Effect.sync(() => void launched.push(url)),
          }),
          Layer.mock(ProcessRunner)({
            run: () => Effect.succeed({ code: 0, stdout: "firefox_firefox.desktop\n" } as never),
          }),
          Layer.succeed(HostProcess.Platform, "linux"),
        ),
      ),
    );
    const session = <A, E>(
      f: (s: typeof BrowserSessions.BrowserSessions.Service) => Effect.Effect<A, E>,
    ) =>
      BrowserSessions.BrowserSessions.pipe(
        Effect.flatMap(f),
        Effect.provide(Layer.fresh(sessions)),
      );
    return Effect.gen(function* () {
      const unseen = yield* session((s) =>
        Effect.zip(s.mode, s.open("perplexity").pipe(Effect.map((tab) => tab.page.driver))),
      );
      assert.equal(
        unseen[0].reason,
        "Install the AmICited Connector in Firefox to use your own sign-ins.",
      );
      assert.deepEqual([unseen[1], launched, managedPages], ["managed", [], ["page"]]);

      yield* session((s) =>
        Effect.gen(function* () {
          connector = firefox;
          assert.equal((yield* s.open("perplexity")).page.browser, "Firefox 156.0");
          assert.equal((yield* s.mode).driver, "extension");
        }),
      );

      connector = null;
      const relaunched = yield* session((s) => s.open("perplexity"));
      assert.equal(relaunched.page.driver, "extension");
      assert.deepEqual(launched, ["http://127.0.0.1:47615/"]);
    }).pipe(
      Effect.provide(
        ServerConfig.layerTest(process.cwd(), { prefix: "browser-sessions-" }).pipe(
          Layer.provideMerge(NodeServices.layer),
        ),
      ),
    );
  },
);

it.effect("says how to fix a managed browser the host's sandbox blocks", () =>
  BrowserSessions.BrowserSessions.pipe(
    Effect.flatMap((s) => Effect.flip(s.open("chatgpt"))),
    Effect.map((error) => {
      assert.include(error.message, "Install the AmICited Connector");
      assert.include(error.message, "`t3 browser setup`");
    }),
    Effect.provide(
      BrowserSessions.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(BrowserBridge, {
              port: 47615,
              current: Effect.succeed(null),
              awaitConnection: () => Effect.succeed(null),
              subscribe: () => () => {},
            }),
            Layer.mock(ServerBrowser)({
              connectionContext: Effect.fail(
                new ServerBrowserLaunchError({
                  cause: new PreviewBrowserSandboxError({ setupCommand: "t3 browser setup" }),
                }),
              ),
            }),
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
      ),
    ),
  ),
);

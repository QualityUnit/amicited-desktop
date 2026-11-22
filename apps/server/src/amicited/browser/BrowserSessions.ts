import type { BrowserChoice, BrowserMode } from "@amicited/cloud-client/connectionsRpc";
import { browserSupport } from "@amicited/visibility/browsers";
import type { EnginePage } from "@amicited/visibility/page";
import { sites, type SiteId } from "@amicited/visibility/sites";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Random from "effect/Random";
import * as Schema from "effect/Schema";
import { ProcessRunner } from "../../processRunner.ts";
import { ServerConfig } from "../../config.ts";
import { ServerBrowser, ServerBrowserLaunchError } from "../../preview/ServerBrowser.ts";
import {
  PreviewBrowserLibrariesError,
  PreviewBrowserRootError,
  PreviewBrowserSandboxError,
} from "../../preview/PreviewBrowserHost.ts";
import { ExternalLauncher } from "../../process/externalLauncher.ts";
import { evidenceEnabled, evidencePage } from "../EvidenceFixtures.ts";
import { BrowserBridge, bridgePage, type BridgeConnection } from "./BrowserBridge.ts";
import { detectDefaultBrowser } from "./DefaultBrowser.ts";
import { playwrightPage } from "./PlaywrightPage.ts";

export type { BrowserMode };
export interface SessionTab {
  readonly page: EnginePage;
  readonly tabId?: string;
  readonly close: () => Promise<unknown>;
}

export class BrowserSessionError extends Schema.TaggedError<BrowserSessionError>()(
  "BrowserSessionError",
  { message: Schema.String },
) {}
const sessionError = (cause: unknown, message: string) =>
  new BrowserSessionError({ message: cause instanceof Error ? cause.message : message });
const isLaunchError = Schema.is(ServerBrowserLaunchError);
const isSandboxError = Schema.is(PreviewBrowserSandboxError);
const isHostSetupError = Schema.is(
  Schema.Union([PreviewBrowserLibrariesError, PreviewBrowserRootError]),
);
/** The launch error's own text is generic; the host diagnosis under it says what to do. */
const managedError = (cause: unknown) => {
  const host = isLaunchError(cause) ? cause.cause : cause;
  if (isSandboxError(host))
    return new BrowserSessionError({
      message: `This computer blocks the sandbox the AmICited browser needs; running \`${host.setupCommand}\` once allows it.`,
    });
  if (isHostSetupError(host)) return new BrowserSessionError({ message: host.message });
  return sessionError(cause, "Could not open the AmICited browser.");
};

export class BrowserSessions extends Context.Service<
  BrowserSessions,
  {
    readonly mode: Effect.Effect<BrowserMode>;
    readonly use: (choice: BrowserChoice) => Effect.Effect<void>;
    /** Calls back when the mode may have changed. */
    readonly subscribe: (listener: () => void) => () => void;
    /** Opens a page for a site; a visible thread asks for a tab the user can sign in through. */
    readonly open: (
      site: SiteId,
      visibleThread?: string,
    ) => Effect.Effect<SessionTab, BrowserSessionError>;
    /** Clears site cookies in the AmICited browser only; the user's own browser is never signed out. */
    readonly clearCookies: (domains: readonly string[]) => Effect.Effect<void, BrowserSessionError>;
  }
>()("t3/amicited/browser/BrowserSessions") {}

const Remembered = Schema.Struct({
  connectorFamilies: Schema.Array(Schema.String),
  use: Schema.optionalKey(Schema.Literals(["app", "connector"])),
});
const decodeRemembered = Schema.decodeUnknownEffect(Schema.fromJsonString(Remembered));
const encodeRemembered = Schema.encodeEffect(Schema.fromJsonString(Remembered));

export const layer = Layer.effect(
  BrowserSessions,
  Effect.gen(function* () {
    const bridge = yield* BrowserBridge;
    const browser = yield* ServerBrowser;
    const launcher = yield* ExternalLauncher;
    const fs = yield* FileSystem.FileSystem;
    const config = yield* ServerConfig;
    const runner = yield* ProcessRunner;
    const random = yield* Random.Random;
    const run = Effect.runPromiseWith(yield* Effect.context<never>());
    const file = `${config.stateDir}/amicited-browser.json`;
    const remembered = yield* fs.readFileString(file).pipe(
      Effect.flatMap(decodeRemembered),
      Effect.orElseSucceed((): typeof Remembered.Type => ({ connectorFamilies: [] })),
    );
    const families = new Set(remembered.connectorFamilies);
    let choice: BrowserChoice = remembered.use ?? "app";
    const listeners = new Set<() => void>();
    const save = Effect.suspend(() =>
      encodeRemembered({ connectorFamilies: [...families], use: choice }),
    ).pipe(
      Effect.flatMap((value) => fs.writeFileString(file, value)),
      Effect.ignoreCause({ log: true }),
    );
    /** Families the connector has run in, so the app may open that browser for it later. */
    const remember = (connection: BridgeConnection | null) =>
      !connection || families.has(connection.info.family)
        ? Effect.void
        : Effect.suspend(() => {
            families.add(connection.info.family);
            return save;
          });
    const detected = yield* Effect.cached(
      detectDefaultBrowser().pipe(Effect.provideService(ProcessRunner, runner)),
    );

    const mode = Effect.fn("BrowserSessions.mode")(function* () {
      const connection = yield* bridge.current;
      if (connection)
        return {
          use: choice,
          connector: connection.info.browser,
          connectorSetup: null,
        } satisfies BrowserMode;
      const family = (yield* detected)?.family ?? "unknown";
      const support = family === "unknown" ? null : browserSupport[family];
      const connectorSetup =
        bridge.port === null
          ? "Another app is using the AmICited Connector port."
          : !support
            ? "Install the AmICited Connector in Chrome, Edge or Firefox."
            : !support.connector
              ? `${support.label} cannot run the AmICited Connector. Install it in Chrome, Edge or Firefox.`
              : `Install the AmICited Connector in ${support.label}.`;
      return { use: choice, connector: null, connectorSetup } satisfies BrowserMode;
    });

    /** A connector that ran here before: open the default browser if it is that one, then wait for it. */
    const connector = Effect.fn("BrowserSessions.connector")(function* () {
      const connected = yield* bridge.current;
      if (connected || bridge.port === null || families.size === 0) return connected;
      const family = (yield* detected)?.family;
      if (family && families.has(family))
        yield* launcher
          .launchBrowser(`http://127.0.0.1:${bridge.port}/`)
          .pipe(Effect.ignoreCause({ log: true }));
      return yield* bridge.awaitConnection("45 seconds");
    });

    /** AmICited's browser: the desktop app's when there is one, else Chromium on this server. */
    const openApp = (site: SiteId, visibleThread?: string) =>
      Effect.tryPromise({
        try: async (): Promise<SessionTab> => {
          if (visibleThread) {
            const tab = await run(browser.connectionTab(visibleThread, sites[site].url));
            return {
              page: playwrightPage(tab.page, () => random.nextDoubleUnsafe()),
              tabId: tab.tabId,
              close: () => run(tab.close),
            };
          }
          const hidden = await run(browser.connectionPage);
          if (hidden)
            return {
              page: playwrightPage(hidden.page, () => random.nextDoubleUnsafe()),
              close: hidden.close,
            };
          const page = await (await run(browser.connectionContext)).newPage();
          return {
            page: playwrightPage(page, () => random.nextDoubleUnsafe()),
            close: () => page.close(),
          };
        },
        catch: managedError,
      });

    const openOwn = (connection: BridgeConnection, site: SiteId, visibleThread?: string) =>
      Effect.tryPromise({
        try: async (): Promise<SessionTab> => {
          const opened = (await connection.call(
            {
              method: "open",
              params: {
                url: visibleThread ? sites[site].url : "about:blank",
                focus: !!visibleThread,
              },
            },
            30_000,
          )) as { tabId: number };
          const page = bridgePage(connection, opened.tabId);
          return { page, close: () => page.close() };
        },
        catch: (cause) => sessionError(cause, "Could not open a tab in your browser."),
      });

    let fixtureIndex = 0;
    return BrowserSessions.of({
      mode: mode(),
      use: Effect.fn("BrowserSessions.use")(function* (next) {
        if (choice === next) return;
        choice = next;
        yield* save;
        for (const listener of listeners) listener();
      }),
      subscribe: (listener) => {
        listeners.add(listener);
        const off = bridge.subscribe(listener);
        return () => {
          listeners.delete(listener);
          off();
        };
      },
      open: Effect.fn("BrowserSessions.open")(function* (site: SiteId, visibleThread?: string) {
        if (evidenceEnabled()) {
          const page = evidencePage(fixtureIndex++);
          return { page, close: () => page.close() };
        }
        if (choice === "connector") {
          const connection = yield* connector();
          yield* remember(connection);
          if (connection) return yield* openOwn(connection, site, visibleThread);
          return yield* new BrowserSessionError({
            message:
              "The AmICited Connector is not connected. Open your browser, or switch Connections back to the AmICited browser.",
          });
        }
        // A launch that never settles would otherwise hold the whole daily run.
        return yield* openApp(site, visibleThread).pipe(
          Effect.timeoutOrElse({
            duration: "1 minute",
            orElse: () =>
              Effect.fail(
                new BrowserSessionError({ message: "The AmICited browser did not start." }),
              ),
          }),
        );
      }),
      clearCookies: Effect.fn("BrowserSessions.clearCookies")(function* (domains) {
        if (evidenceEnabled()) return;
        const matches = (domain: string) =>
          domains.some((d) => domain.replace(/^\./, "") === d || domain.endsWith(`.${d}`));
        yield* Effect.tryPromise({
          try: async () => {
            const hidden = await run(browser.connectionPage);
            if (!hidden) {
              const context = await run(browser.connectionContext);
              for (const domain of domains)
                await context.clearCookies({
                  domain: new RegExp(String.raw`(^|\.)${domain.replaceAll(".", String.raw`\.`)}$`),
                });
              return;
            }
            try {
              const cdp = await hidden.page.context().newCDPSession(hidden.page);
              const { cookies } = await cdp.send("Network.getAllCookies");
              for (const cookie of cookies.filter((c) => matches(c.domain)))
                await cdp.send("Network.deleteCookies", {
                  name: cookie.name,
                  domain: cookie.domain,
                  path: cookie.path,
                });
            } finally {
              await hidden.close();
            }
          },
          catch: (cause) => sessionError(cause, "Could not sign out of the AmICited browser."),
        });
      }),
    });
  }),
);

import { browserSupport, type DefaultBrowser } from "@amicited/visibility/browsers";
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

export interface BrowserMode {
  readonly driver: "extension" | "managed";
  /** The browser runs use, for people. */
  readonly browser: string;
  readonly defaultBrowser: DefaultBrowser | null;
  /** Why runs use the AmICited browser instead of the user's own; null when they do not. */
  readonly reason: string | null;
}
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
      message: `Install the AmICited Connector in your browser to run checks there. This computer blocks the sandbox the AmICited browser needs; running \`${host.setupCommand}\` once allows it.`,
    });
  if (isHostSetupError(host)) return new BrowserSessionError({ message: host.message });
  return sessionError(cause, "Could not open the AmICited browser.");
};

export class BrowserSessions extends Context.Service<
  BrowserSessions,
  {
    readonly mode: Effect.Effect<BrowserMode>;
    /** Opens a page for a site; a visible thread asks for a tab the user can sign in through. */
    readonly open: (
      site: SiteId,
      visibleThread?: string,
    ) => Effect.Effect<SessionTab, BrowserSessionError>;
    /** Clears site cookies in the AmICited browser only; the user's own browser is never signed out. */
    readonly clearCookies: (domains: readonly string[]) => Effect.Effect<void, BrowserSessionError>;
  }
>()("t3/amicited/browser/BrowserSessions") {}

const Remembered = Schema.Struct({ connectorFamilies: Schema.Array(Schema.String) });
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
    const families = new Set(
      (yield* fs.readFileString(file).pipe(
        Effect.flatMap(decodeRemembered),
        Effect.orElseSucceed(() => ({ connectorFamilies: [] })),
      )).connectorFamilies,
    );
    /** Families the connector has run in, so the app may open that browser for it later. */
    const remember = (connection: BridgeConnection | null) =>
      !connection || families.has(connection.info.family)
        ? Effect.void
        : Effect.suspend(() => {
            families.add(connection.info.family);
            return encodeRemembered({ connectorFamilies: [...families] });
          }).pipe(
            Effect.flatMap((value) => fs.writeFileString(file, value)),
            Effect.ignoreCause({ log: true }),
          );
    const detected = yield* Effect.cached(
      detectDefaultBrowser().pipe(Effect.provideService(ProcessRunner, runner)),
    );

    const mode = Effect.fn("BrowserSessions.mode")(function* (connection: BridgeConnection | null) {
      const defaultBrowser = yield* detected;
      if (connection)
        return {
          driver: "extension",
          browser: connection.info.browser,
          defaultBrowser,
          reason: null,
        } satisfies BrowserMode;
      const family = defaultBrowser?.family ?? "unknown";
      const support = family === "unknown" ? null : browserSupport[family];
      const reason =
        bridge.port === null
          ? "Another app is using the AmICited Connector port."
          : !support
            ? "AmICited cannot detect your default browser."
            : !support.connector
              ? `${support.label} cannot be driven yet.`
              : `Install the AmICited Connector in ${support.label} to use your own sign-ins.`;
      return {
        driver: "managed",
        browser: "AmICited browser",
        defaultBrowser,
        reason,
      } satisfies BrowserMode;
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

    const openManaged = (site: SiteId, visibleThread?: string) =>
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
      mode: bridge.current.pipe(Effect.flatMap(mode)),
      open: Effect.fn("BrowserSessions.open")(function* (site: SiteId, visibleThread?: string) {
        if (evidenceEnabled()) {
          const page = evidencePage(fixtureIndex++);
          return { page, close: () => page.close() };
        }
        const connection = yield* connector();
        yield* remember(connection);
        if (connection) return yield* openOwn(connection, site, visibleThread);
        // A launch that never settles would otherwise hold the whole daily run.
        return yield* openManaged(site, visibleThread).pipe(
          Effect.timeoutOrElse({
            duration: "1 minute",
            orElse: () =>
              Effect.fail(
                new BrowserSessionError({
                  message:
                    "The AmICited browser did not start. Install the AmICited Connector in your browser to run checks there.",
                }),
              ),
          }),
        );
      }),
      clearCookies: Effect.fn("BrowserSessions.clearCookies")(function* (domains) {
        if (evidenceEnabled() || (yield* bridge.current)) return;
        yield* Effect.tryPromise({
          try: async () => {
            const context = await run(browser.connectionContext);
            for (const domain of domains)
              await context.clearCookies({
                domain: new RegExp(String.raw`(^|\.)${domain.replaceAll(".", String.raw`\.`)}$`),
              });
          },
          catch: (cause) => sessionError(cause, "Could not sign out of the AmICited browser."),
        });
      }),
    });
  }),
);

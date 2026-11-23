/** Gives AmICited's `connections` profile a plain Chrome User-Agent for sign-in and checks. */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as BrowserSession from "../preview/BrowserSession.ts";

/** The server's profile for AI app sign-ins and tracking checks (`ServerBrowser.connectionPage`). */
const CONNECTIONS_PROFILE_ID = "connections";

/**
 * Drops the app and `Electron/` tokens and keeps the real Chrome version, which the client
 * hints report too. ChatGPT fails every signed-out chat ("Chat stopped unexpectedly") for a
 * User-Agent carrying `Electron/`.
 */
export const chromeUserAgent = (native: string): string =>
  native.replace(/(\(KHTML, like Gecko\)) .*?(Chrome\/)/, "$1 $2").replace(/ Electron\/\S+/, "");

const isConnectionsScope = (scope: string | undefined) => {
  try {
    const parsed: unknown = JSON.parse(scope ?? "");
    return Array.isArray(parsed) && parsed[1] === CONNECTIONS_PROFILE_ID;
  } catch {
    return false;
  }
};

/**
 * BrowserSession whose `connections` partition uses `chromeUserAgent`. Other profiles keep
 * Electron's native User-Agent, which upstream needs for Cloudflare Turnstile. Every guest
 * asks for its session before it is created, so the sign-in webview and the hidden check
 * windows get the same User-Agent and the cookies they share stay valid for both.
 */
export const decorate = Layer.effect(
  BrowserSession.BrowserSession,
  Effect.gen(function* () {
    const sessions = yield* BrowserSession.BrowserSession;
    return BrowserSession.BrowserSession.of({
      ...sessions,
      getSession: Effect.fn("ConnectionsUserAgent.getSession")(
        function* (scope, persistent, namespace) {
          const session = yield* sessions.getSession(scope, persistent, namespace);
          if (namespace === "profile" && isConnectionsScope(scope)) {
            const userAgent = chromeUserAgent(session.getUserAgent());
            if (userAgent !== session.getUserAgent()) session.setUserAgent(userAgent);
          }
          return session;
        },
      ),
    });
  }),
);

export const layer = decorate.pipe(Layer.provide(BrowserSession.layer));

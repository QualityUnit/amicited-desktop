import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { vi } from "vite-plus/test";

vi.mock("electron", () => ({}));

import { resolvePartitionScope } from "../ipc/methods/preview.ts";
import * as BrowserSession from "../preview/BrowserSession.ts";
import * as ConnectionsUserAgent from "./ConnectionsUserAgent.ts";

const native =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) AmICitedDesktopDev/0.0 Chrome/152.0.7977.169 Electron/44.10.1 Safari/537.36";
const chrome =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.169 Safari/537.36";

it.each([
  native,
  chrome
    .replace(") Chrome/", ") AmICitedDesktop(Alpha)/1.4.0 Chrome/")
    .replace(" Safari", " Electron/44.10.1 Safari"),
  chrome.replace(" Safari", " Electron/44.10.1 Safari"),
  chrome,
])("reads %s as plain Chrome", (userAgent) => {
  expect(ConnectionsUserAgent.chromeUserAgent(userAgent)).toBe(chrome);
});

it.effect("gives only the connections profile's session the Chrome User-Agent", () => {
  const sessions = new Map<string, { userAgent: string }>();
  const fake = Layer.succeed(BrowserSession.BrowserSession, {
    getSession: (scope = "shared") =>
      Effect.sync(() => {
        const session = sessions.get(scope) ?? { userAgent: native };
        sessions.set(scope, session);
        return {
          getUserAgent: () => session.userAgent,
          setUserAgent: (next: string) => {
            session.userAgent = next;
          },
        } as unknown as Electron.Session;
      }),
  } as unknown as BrowserSession.BrowserSession["Service"]);
  return Effect.gen(function* () {
    const browserSessions = yield* BrowserSession.BrowserSession;
    const open = (profileId?: string) => {
      const { scope, persistent, namespace } = resolvePartitionScope("env-1", profileId);
      return browserSessions.getSession(scope, persistent, namespace);
    };
    expect((yield* open("connections")).getUserAgent()).toBe(chrome);
    expect((yield* open("work")).getUserAgent()).toBe(native);
    expect((yield* open()).getUserAgent()).toBe(native);
  }).pipe(Effect.provide(ConnectionsUserAgent.decorate.pipe(Layer.provide(fake))));
});

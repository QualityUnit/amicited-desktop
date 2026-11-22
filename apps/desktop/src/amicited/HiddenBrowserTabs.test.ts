// @effect-diagnostics nodeBuiltinImport:off - Stands in for Electron's windows and debugger.
import { expect, it } from "@effect/vitest";
import { DesktopBrowserEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as NodeEvents from "node:events";
import { vi } from "vite-plus/test";

vi.mock("electron", () => ({}));

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as BrowserSession from "../preview/BrowserSession.ts";
import * as DesktopBrowserHost from "../preview/DesktopBrowserHost.ts";
import * as HiddenBrowserTabs from "./HiddenBrowserTabs.ts";

const decodeEvent = Schema.decodeUnknownSync(Schema.fromJsonString(DesktopBrowserEvent));
const key = { threadId: "amicited-checks", tabId: "check-1" };

it.effect(
  "opens a hidden page in the profile's webview partition until the server closes it",
  () => {
    const windows: Array<{
      readonly options: Electron.BrowserWindowConstructorOptions;
      destroyed: boolean;
    }> = [];
    const create = (options: Electron.BrowserWindowConstructorOptions) => {
      const record = { options, destroyed: false };
      windows.push(record);
      const contents = Object.assign(new NodeEvents.EventEmitter(), {
        setAudioMuted: () => {},
        setWindowOpenHandler: () => {},
        loadURL: async () => {},
        debugger: Object.assign(new NodeEvents.EventEmitter(), { attach: () => {} }),
      });
      return {
        webContents: contents,
        isDestroyed: () => record.destroyed,
        destroy: () => {
          record.destroyed = true;
          contents.emit("destroyed");
        },
      } as unknown as Electron.BrowserWindow;
    };
    return Effect.gen(function* () {
      const host = yield* DesktopBrowserHost.DesktopBrowserHost;
      const events = yield* host.events.pipe(
        Stream.map((line) => decodeEvent(new TextDecoder().decode(line))),
        Stream.take(2),
        Stream.runCollect,
        Effect.forkScoped,
      );
      yield* Effect.yieldNow;
      yield* host.handleCommandLine(
        JSON.stringify({
          type: "openHidden",
          ...key,
          environmentId: "env-1",
          profileId: "connections",
        }),
      );
      yield* host.handleCommandLine(JSON.stringify({ type: "closeHidden", ...key }));

      expect(yield* Fiber.join(events)).toEqual([
        { type: "attached", ...key },
        { type: "detached", ...key },
      ]);
      expect(windows).toMatchObject([
        {
          options: {
            show: false,
            webPreferences: { partition: `profile:${JSON.stringify(["env-1", "connections"])}` },
          },
          destroyed: true,
        },
      ]);
    }).pipe(
      Effect.provide(
        HiddenBrowserTabs.layer.pipe(
          Layer.provideMerge(DesktopBrowserHost.layer),
          Layer.provide(
            Layer.mock(BrowserSession.BrowserSession)({
              isPartition: () => true,
              getSession: () => Effect.succeed({} as Electron.Session),
              getPartition: (scope, _persistent, namespace) =>
                Effect.succeed(`${namespace}:${scope}`),
            }),
          ),
          Layer.provide(
            Layer.mock(ElectronWindow.ElectronWindow)({
              create: (options) => Effect.sync(() => create(options)),
            }),
          ),
        ),
      ),
    );
  },
);

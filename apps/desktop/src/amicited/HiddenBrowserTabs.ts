/** Pages the server drives with no window showing them, such as AmICited's tracking checks. */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as ElectronWindow from "../electron/ElectronWindow.ts";
import { resolvePartitionScope } from "../ipc/methods/preview.ts";
import * as BrowserSession from "../preview/BrowserSession.ts";
import * as DesktopBrowserHost from "../preview/DesktopBrowserHost.ts";

/** A backend that dies mid-check never closes its page; no check runs this long. */
const MAX_LIFETIME = "15 minutes";

const keyOf = ({ threadId, tabId }: DesktopBrowserHost.DesktopBrowserTabKey) =>
  `${threadId}\u0000${tabId}`;

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const host = yield* DesktopBrowserHost.DesktopBrowserHost;
    const sessions = yield* BrowserSession.BrowserSession;
    const electronWindow = yield* ElectronWindow.ElectronWindow;
    const scope = yield* Effect.scope;
    const windows = new Map<string, Electron.BrowserWindow>();

    const close = (id: string) => {
      const window = windows.get(id);
      windows.delete(id);
      if (window && !window.isDestroyed()) window.destroy();
    };

    const open = Effect.fn("HiddenBrowserTabs.open")(function* (
      command: Extract<DesktopBrowserHost.DesktopHiddenTabCommand, { type: "openHidden" }>,
    ) {
      const key = { threadId: command.threadId, tabId: command.tabId };
      const id = keyOf(key);
      if (windows.has(id)) return;
      // The same partition the profile's webviews use, so the page shares their sign-ins.
      const {
        scope: partitionScope,
        persistent,
        namespace,
      } = resolvePartitionScope(command.environmentId, command.profileId);
      yield* sessions.getSession(partitionScope, persistent, namespace);
      const partition = yield* sessions.getPartition(partitionScope, persistent, namespace);
      const window = yield* electronWindow.create(
        {
          show: false,
          skipTaskbar: true,
          width: 1280,
          height: 900,
          webPreferences: {
            partition,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
          },
        },
        { auxiliary: true },
      );
      windows.set(id, window);
      const contents = window.webContents;
      contents.once("destroyed", () => {
        if (windows.get(id) === window) windows.delete(id);
        host.detach(key);
      });
      contents.setAudioMuted(true);
      contents.setWindowOpenHandler(() => ({ action: "deny" }));
      yield* Effect.promise(() => contents.loadURL("about:blank").catch(() => undefined));
      const attached = yield* Effect.sync(() => {
        try {
          contents.debugger.attach("1.3");
          return true;
        } catch {
          close(id);
          return false;
        }
      });
      if (!attached) return yield* Effect.logWarning("could not attach to a hidden page");
      host.attach(key, { webContents: contents, debugger: contents.debugger });
      yield* Effect.sleep(MAX_LIFETIME).pipe(
        Effect.andThen(Effect.sync(() => windows.get(id) === window && close(id))),
        Effect.forkIn(scope),
      );
    });

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const window of windows.values()) if (!window.isDestroyed()) window.destroy();
        windows.clear();
      }),
    );
    yield* host.hiddenTabs.pipe(
      Stream.runForEach((command) =>
        command.type === "openHidden"
          ? open(command).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("could not open a hidden page", cause),
              ),
            )
          : Effect.sync(() => close(keyOf(command))),
      ),
      Effect.forkScoped,
    );
  }),
);

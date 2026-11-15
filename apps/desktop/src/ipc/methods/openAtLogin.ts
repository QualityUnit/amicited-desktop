import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Electron from "electron";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

// AmICited: opening at login lets a daily audit missed while the computer was off run at startup.
const autostartFile = Effect.gen(function* () {
  const path = yield* Path.Path;
  const config = yield* Config.String("XDG_CONFIG_HOME").pipe(
    Config.withDefault(""),
    Effect.orElseSucceed(() => ""),
  );
  return path.join(
    config || path.join(Electron.app.getPath("home"), ".config"),
    "autostart",
    "amicited-desktop.desktop",
  );
});

// Electron's login items cover macOS and Windows only; Linux desktops read XDG autostart entries.
const readOpenAtLogin = Effect.gen(function* () {
  if (!Electron.app.isPackaged) return null;
  if ((yield* HostProcess.Platform) !== "linux")
    return Electron.app.getLoginItemSettings().openAtLogin;
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.exists(yield* autostartFile).pipe(Effect.orElseSucceed(() => false));
});

export const getOpenAtLogin = DesktopIpc.makeSyncIpcMethod({
  channel: IpcChannels.GET_OPEN_AT_LOGIN_CHANNEL,
  result: Schema.NullOr(Schema.Boolean),
  handler: Effect.fn("desktop.ipc.openAtLogin.get")(function* () {
    return yield* readOpenAtLogin;
  }),
});

export const setOpenAtLogin = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SET_OPEN_AT_LOGIN_CHANNEL,
  payload: Schema.Boolean,
  result: Schema.NullOr(Schema.Boolean),
  handler: Effect.fn("desktop.ipc.openAtLogin.set")(function* (enabled) {
    if (!Electron.app.isPackaged) return null;
    if ((yield* HostProcess.Platform) !== "linux") {
      Electron.app.setLoginItemSettings({ openAtLogin: enabled });
      return yield* readOpenAtLogin;
    }
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = yield* autostartFile;
    if (!enabled) {
      yield* fs.remove(file, { force: true }).pipe(Effect.ignore);
      return yield* readOpenAtLogin;
    }
    // An AppImage's execPath lives in a temporary mount; APPIMAGE names the file to start.
    const appImage = yield* Config.String("APPIMAGE").pipe(
      Config.withDefault(""),
      Effect.orElseSucceed(() => ""),
    );
    const exec = appImage || process.execPath;
    yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(Effect.ignore);
    yield* fs
      .writeFileString(
        file,
        [
          "[Desktop Entry]",
          "Type=Application",
          `Name=${Electron.app.getName()}`,
          `Exec="${exec.replaceAll('"', '\\"')}"`,
          "X-GNOME-Autostart-enabled=true",
          "",
        ].join("\n"),
      )
      .pipe(Effect.ignore);
    return yield* readOpenAtLogin;
  }),
});

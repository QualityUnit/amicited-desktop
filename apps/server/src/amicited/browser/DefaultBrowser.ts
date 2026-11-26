import {
  parseLinuxDefault,
  parseMacDefault,
  parseWindowsDefault,
  type DefaultBrowser,
} from "@amicited/visibility/browsers";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { ProcessRunner } from "../../processRunner.ts";

const userChoice = String.raw`HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https`;

/** Asks the OS which browser opens web links; null when it cannot tell. */
export const detectDefaultBrowser = Effect.fn("DefaultBrowser.detect")(function* () {
  const platform = yield* HostProcess.Platform;
  const runner = yield* ProcessRunner;
  const stdout = (command: string, args: readonly string[]) =>
    runner.run({ command, args, timeout: "5 seconds" }).pipe(
      Effect.map((out) => (out.code === 0 ? out.stdout : "")),
      Effect.orElseSucceed(() => ""),
    );
  if (platform === "linux")
    return parseLinuxDefault(yield* stdout("xdg-settings", ["get", "default-web-browser"]));
  if (platform === "darwin") {
    const home = yield* Config.String("HOME").pipe(Effect.orElseSucceed(() => ""));
    return parseMacDefault(
      yield* stdout("plutil", [
        "-convert",
        "json",
        "-o",
        "-",
        `${home}/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist`,
      ]),
    );
  }
  if (platform === "win32") {
    for (const key of [`${userChoice}\\UserChoiceLatest`, `${userChoice}\\UserChoice`]) {
      const found = parseWindowsDefault(yield* stdout("reg", ["query", key, "/v", "ProgId"]));
      if (found) return found;
    }
  }
  return null as DefaultBrowser | null;
});

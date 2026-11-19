export type BrowserFamily =
  | "chrome"
  | "edge"
  | "brave"
  | "arc"
  | "vivaldi"
  | "opera"
  | "chromium"
  | "firefox"
  | "safari";
export interface DefaultBrowser {
  readonly family: BrowserFamily | "unknown";
  /** What the OS reported: a desktop file, bundle id or ProgId. */
  readonly id: string;
}

/** How AmICited drives each family with the user's own profile. */
export const browserSupport: Record<
  BrowserFamily,
  { readonly connector: "chromium" | "firefox" | null; readonly label: string }
> = {
  chrome: { connector: "chromium", label: "Google Chrome" },
  edge: { connector: "chromium", label: "Microsoft Edge" },
  brave: { connector: "chromium", label: "Brave" },
  arc: { connector: "chromium", label: "Arc" },
  vivaldi: { connector: "chromium", label: "Vivaldi" },
  opera: { connector: "chromium", label: "Opera" },
  chromium: { connector: "chromium", label: "Chromium" },
  firefox: { connector: "firefox", label: "Firefox" },
  // Safari extensions ship only inside a signed macOS app, and safaridriver cannot use the
  // user's own profile, so Safari users get the AmICited browser.
  safari: { connector: null, label: "Safari" },
};

const patterns: readonly [RegExp, BrowserFamily][] = [
  [/microsoft-?edge|msedge|^com\.microsoft\.edgemac/i, "edge"],
  [/brave/i, "brave"],
  [/thebrowser|^arc/i, "arc"],
  [/vivaldi/i, "vivaldi"],
  [/opera/i, "opera"],
  [/^chromium|chromium[-_.]|org\.chromium/i, "chromium"],
  [/chrome/i, "chrome"],
  [/firefox|mozilla|librewolf|waterfox/i, "firefox"],
  [/safari/i, "safari"],
];
export function browserFamily(id: string): DefaultBrowser["family"] {
  return patterns.find(([pattern]) => pattern.test(id))?.[1] ?? "unknown";
}
const known = (id: string): DefaultBrowser | null => {
  const trimmed = id.trim();
  return trimmed ? { family: browserFamily(trimmed), id: trimmed } : null;
};

/** `xdg-settings get default-web-browser`, e.g. `firefox_firefox.desktop` for the snap. */
export function parseLinuxDefault(output: string) {
  return known(output.split("\n")[0] ?? "");
}

/**
 * The LaunchServices handlers as JSON, from
 * `plutil -convert json -o - ~/Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist`.
 * With no https handler the system default, Safari, applies.
 */
export function parseMacDefault(json: string): DefaultBrowser {
  let handlers: unknown = [];
  try {
    handlers = (JSON.parse(json) as { LSHandlers?: unknown }).LSHandlers ?? [];
  } catch {
    handlers = [];
  }
  const entries = Array.isArray(handlers) ? (handlers as Record<string, unknown>[]) : [];
  const handler = (scheme: string) =>
    entries.find((h) => h.LSHandlerURLScheme === scheme)?.LSHandlerRoleAll;
  const id = handler("https") ?? handler("http");
  return typeof id === "string" && id !== "-"
    ? { family: browserFamily(id), id }
    : { family: "safari", id: "com.apple.safari" };
}

/**
 * `reg query` of `HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoiceLatest`
 * (Windows 11) or `...\UserChoice`, value `ProgId`. Firefox's ProgId carries an install hash.
 */
export function parseWindowsDefault(output: string) {
  const match = /^\s*ProgId\s+REG_SZ\s+(\S.*?)\s*$/im.exec(output);
  return match ? known(match[1]!) : null;
}

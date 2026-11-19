import { describe, expect, it } from "vite-plus/test";
import { parseLinuxDefault, parseMacDefault, parseWindowsDefault } from "./browsers.ts";

describe("default browser detection", () => {
  it("reads xdg-settings desktop ids, including snap and flatpak packages", () => {
    expect(
      [
        "firefox_firefox.desktop\n",
        "org.mozilla.firefox.desktop",
        "google-chrome.desktop",
        "chromium_chromium.desktop",
        "org.chromium.Chromium.desktop",
        "microsoft-edge.desktop",
        "com.brave.Browser.desktop",
        "vivaldi-stable.desktop",
        "epiphany.desktop",
      ].map((id) => parseLinuxDefault(id)?.family),
    ).toEqual([
      "firefox",
      "firefox",
      "chrome",
      "chromium",
      "chromium",
      "edge",
      "brave",
      "vivaldi",
      "unknown",
    ]);
    expect(parseLinuxDefault("")).toBeNull();
  });

  it("reads LaunchServices handlers and falls back to Safari", () => {
    const handlers = (id: string) =>
      JSON.stringify({
        LSHandlers: [
          { LSHandlerURLScheme: "mailto", LSHandlerRoleAll: "com.apple.mail" },
          { LSHandlerURLScheme: "https", LSHandlerRoleAll: id },
        ],
      });
    expect(parseMacDefault(handlers("company.thebrowser.browser")).family).toBe("arc");
    expect(parseMacDefault(handlers("com.microsoft.edgemac")).family).toBe("edge");
    expect(parseMacDefault(handlers("com.google.chrome")).family).toBe("chrome");
    expect(parseMacDefault(JSON.stringify({ LSHandlers: [] }))).toEqual({
      family: "safari",
      id: "com.apple.safari",
    });
    expect(parseMacDefault("not json").family).toBe("safari");
  });

  it("reads the Windows UserChoice ProgId", () => {
    const reg = (progId: string) =>
      `\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice\r\n    ProgId    REG_SZ    ${progId}\r\n\r\n`;
    expect(
      ["ChromeHTML", "MSEdgeHTM", "BraveHTML", "FirefoxURL-308046B0AF4A39CB", "ArcHTML"].map(
        (id) => parseWindowsDefault(reg(id))?.family,
      ),
    ).toEqual(["chrome", "edge", "brave", "firefox", "arc"]);
    expect(
      parseWindowsDefault("ERROR: The system was unable to find the specified registry key"),
    ).toBeNull();
  });
});

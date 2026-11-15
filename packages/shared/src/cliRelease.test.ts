import { describe, expect, it } from "vite-plus/test";

import {
  CLI_RELEASE_BASE_URL_ENV,
  CLI_RELEASES_PAGE_URL,
  cliArchiveFileName,
  cliArchiveTarCommand,
  cliReleaseAssetUrl,
  cliReleaseDownloadBaseUrl,
  cliReleaseIndexPageUrl,
  newestCliReleaseVersion,
  npmReleaseDatabaseMigration,
  parseChecksums,
} from "./cliRelease.ts";

describe("cliRelease", () => {
  it("resolves releases only from AmICited's repository and archive names", () => {
    const repo = "https://github.com/QualityUnit/amicited-desktop";
    expect(CLI_RELEASES_PAGE_URL).toBe(`${repo}/releases`);
    expect(CLI_RELEASE_BASE_URL_ENV).toBe("AMICITED_RELEASE_BASE_URL");
    expect(cliReleaseIndexPageUrl(2)).toBe(
      "https://api.github.com/repos/QualityUnit/amicited-desktop/releases?per_page=100&page=2",
    );
    expect(cliReleaseDownloadBaseUrl("1.2.3")).toBe(`${repo}/releases/download/v1.2.3`);
    expect(cliReleaseAssetUrl("1.2.3", "SHA256SUMS")).toBe(
      `${repo}/releases/download/v1.2.3/SHA256SUMS`,
    );
    // A T3 Code release mirror lists `t3-*` archives, so it can never satisfy a lookup.
    expect(cliArchiveFileName("1.2.3", "linux-x64")).toBe("amicited-1.2.3-linux-x64.tar.gz");
    expect(cliArchiveFileName("1.2.3", "win32-arm64")).toBe("amicited-1.2.3-win32-arm64.zip");
  });

  it("reads the database migration from the amicited npm manifest key only", () => {
    expect(npmReleaseDatabaseMigration({ amicited: { databaseMigration: 42 } })).toBe(42);
    expect(npmReleaseDatabaseMigration({ t3code: { databaseMigration: 42 } })).toBeUndefined();
  });

  it("parses sha256sum output including binary-mode markers", () => {
    const checksums = parseChecksums(
      [
        `${"a".repeat(64)}  t3-1.2.3-linux-x64.tar.gz`,
        `${"B".repeat(64)} *t3-1.2.3-win32-x64.zip`,
        "not a checksum line",
        "",
      ].join("\n"),
    );
    expect(checksums.get("t3-1.2.3-linux-x64.tar.gz")).toBe("a".repeat(64));
    expect(checksums.get("t3-1.2.3-win32-x64.zip")).toBe("b".repeat(64));
    expect(checksums.size).toBe(2);
  });

  it("extracts with the System32 bsdtar on Windows and plain tar elsewhere", () => {
    expect(cliArchiveTarCommand("linux", {})).toBe("tar");
    expect(cliArchiveTarCommand("win32", { SystemRoot: "D:\\Win" })).toBe(
      "D:\\Win\\System32\\tar.exe",
    );
    expect(cliArchiveTarCommand("win32", {})).toBe("C:\\Windows\\System32\\tar.exe");
  });

  it("picks the newest non-draft release on the requested channel", () => {
    const releases = [
      { tag_name: "v1.2.4-preview.20260912.9", draft: true },
      { tag_name: "v1.2.4-preview.20260912.8" },
      { tag_name: "v1.2.4-nightly.20260912.7" },
      { tag_name: "desktop-preview" },
      { tag_name: "v1.2.3" },
      { tag_name: "v1.2.3-nightly.20260911.2" },
    ];
    expect(newestCliReleaseVersion(releases, "preview")).toBe("1.2.4-preview.20260912.8");
    expect(newestCliReleaseVersion(releases, "nightly")).toBe("1.2.4-nightly.20260912.7");
    expect(newestCliReleaseVersion(releases, "stable")).toBe("1.2.3");
    expect(newestCliReleaseVersion([{ tag_name: "v1.2.3" }], "preview")).toBeUndefined();
  });
});

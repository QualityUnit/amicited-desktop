import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeChildProcess from "node:child_process";
import * as NodeUtil from "node:util";
import { expect, it } from "vite-plus/test";
import { inspectSiteFiles } from "./siteFiles.ts";

it("inspects a local fixture with and without Git history", async () => {
  const folder = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "amicited-site-"));
  try {
    await NodeFSP.writeFile(
      NodePath.join(folder, "package.json"),
      JSON.stringify({ dependencies: { next: "16" } }),
    );
    expect(await inspectSiteFiles(folder)).toEqual({ git: false, framework: "Next.js" });
    await NodeUtil.promisify(NodeChildProcess.execFile)("git", ["init", folder]);
    expect(await inspectSiteFiles(folder)).toEqual({ git: true, framework: "Next.js" });
  } finally {
    await NodeFSP.rm(folder, { recursive: true, force: true });
  }
});

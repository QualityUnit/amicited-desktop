import * as NodeFSP from "node:fs/promises";
import * as NodeChildProcess from "node:child_process";
import * as NodeUtil from "node:util";
import { detectFramework } from "./domainModel.ts";

export async function inspectSiteFiles(path: string) {
  const files = await NodeFSP.readdir(path);
  const packageJson = files.includes("package.json")
    ? await NodeFSP.readFile(`${path}/package.json`, "utf8")
    : undefined;
  const git = await NodeUtil.promisify(NodeChildProcess.execFile)("git", [
    "-C",
    path,
    "rev-parse",
    "--is-inside-work-tree",
  ]).then(
    ({ stdout }) => stdout.trim() === "true",
    () => false,
  );
  return { git, framework: detectFramework(files, packageJson) };
}

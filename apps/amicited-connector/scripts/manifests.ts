// @effect-diagnostics nodeBuiltinImport:off - A build script that writes the extension manifests.
// Writes the Chromium (MV3) and Firefox (MV2, persistent background) builds next to the bundle.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { sites } from "@amicited/visibility/sites";
import packageJson from "../package.json" with { type: "json" };

const dist = NodePath.join(import.meta.dirname, "..", "dist");
const hosts = [
  ...new Set(Object.values(sites).flatMap((site) => site.hosts.map((h) => `https://${h}/*`))),
  "http://127.0.0.1/*",
];
const common = {
  name: "AmICited Connector",
  version: packageJson.version,
  description:
    "Lets AmICited Desktop check your AI visibility in this browser, with your own sign-ins.",
};
const manifests = {
  chrome: {
    ...common,
    manifest_version: 3,
    minimum_chrome_version: "116",
    background: { service_worker: "background.js" },
    permissions: ["tabs", "scripting", "alarms"],
    host_permissions: hosts,
  },
  firefox: {
    ...common,
    manifest_version: 2,
    background: { scripts: ["background.js"], persistent: true },
    permissions: ["tabs", "scripting", "alarms", ...hosts],
    browser_specific_settings: {
      gecko: { id: "connector@amicited.com", strict_min_version: "115.0" },
    },
  },
};
for (const [target, manifest] of Object.entries(manifests)) {
  const dir = NodePath.join(dist, target);
  NodeFS.mkdirSync(dir, { recursive: true });
  NodeFS.copyFileSync(
    NodePath.join(dist, "background.iife.js"),
    NodePath.join(dir, "background.js"),
  );
  NodeFS.writeFileSync(
    NodePath.join(dir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

import { expect, it } from "vite-plus/test";
import type { Connection } from "@amicited/cloud-client/model";
import { canUseReportConnection, findReportKeySource } from "./marketingReports.logic";

it("requires an API key for report actions and reuses only a different domain's API key", () => {
  const domains = ["current", "oauth", "unknown", "key"].map((projectId) => ({
    projectId,
    hostname: `${projectId}.test`,
    brand: projectId,
    connectionRef: projectId,
  }));
  const connections = new Map<string, Connection>([
    ["current", { state: "connected", auth: "apiKey", workspace: "workspace", scopes: [] }],
    ["oauth", { state: "connected", auth: "oauth", workspace: "workspace", scopes: [] }],
    ["unknown", { state: "connected", workspace: "workspace", scopes: [] }],
    ["key", { state: "connected", auth: "apiKey", workspace: "workspace", scopes: [] }],
  ]);
  expect([...connections.values()].map(canUseReportConnection)).toEqual([true, false, false, true]);
  expect(canUseReportConnection({ state: "disconnected" })).toBe(false);
  expect(canUseReportConnection({ state: "connecting" })).toBe(false);
  expect(canUseReportConnection(null)).toBe(false);
  expect(findReportKeySource(domains, "current", (id) => connections.get(id))?.projectId).toBe(
    "key",
  );
  connections.delete("key");
  expect(findReportKeySource(domains, "current", (id) => connections.get(id))).toBeUndefined();
});

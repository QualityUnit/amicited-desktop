import { expect, it } from "vite-plus/test";
import { groupReports } from "./reports.js";
it("groups by domain, hides archived reports, and sorts domains and titles", () => {
  const domains = [
    { projectId: "b", hostname: "z.test" },
    { projectId: "a", hostname: "a.test" },
  ];
  const rows = [
    { projectId: "a", title: "Zebra", archivedAt: null },
    { projectId: "a", title: "Alpha", archivedAt: null },
    { projectId: "b", title: "Archived", archivedAt: "2026-01-01" },
    { projectId: "missing", title: "Deleted domain", archivedAt: null },
  ];
  expect(
    groupReports(rows, domains, false).map((group) => [
      group.hostname,
      group.reports.map((row) => row.title),
    ]),
  ).toEqual([["a.test", ["Alpha", "Zebra"]]]);
  expect(groupReports(rows, domains, true).map((group) => group.hostname)).toEqual([
    "a.test",
    "z.test",
  ]);
});

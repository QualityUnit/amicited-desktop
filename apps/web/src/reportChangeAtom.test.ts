import { expect, it } from "vite-plus/test";
import { Atom, AtomRegistry, AsyncResult } from "effect/reactivity";
import type { ReportChange as ReportChangeSchema } from "@amicited/reports/rpc";
import { reportChangeAtom } from "./reportChangeAtom";

type ReportChange = typeof ReportChangeSchema.Type;

it("invalidates a report only for its own changes and retains the last relevant event", () => {
  const registry = AtomRegistry.make();
  const source = Atom.make<AsyncResult.AsyncResult<ReportChange>>(AsyncResult.initial());
  const filtered = reportChangeAtom(source, "report-a");
  const seen: Array<ReportChange | null> = [];
  const unsubscribe = registry.subscribe(filtered, (value) => seen.push(value), {
    immediate: true,
  });
  const matching: ReportChange = { projectId: "project", reportId: "report-a", kind: "snapshot" };
  registry.set(source, AsyncResult.success({ ...matching, reportId: "report-b" }));
  expect(seen).toEqual([null]);
  registry.set(source, AsyncResult.success(matching));
  registry.set(source, AsyncResult.success({ ...matching, reportId: "report-b" }));
  expect(seen).toEqual([null, matching]);
  expect(registry.get(filtered)).toBe(matching);
  registry.set(source, AsyncResult.success({ ...matching, kind: "updated" }));
  expect(seen).toHaveLength(3);
  unsubscribe();
  registry.dispose();
});

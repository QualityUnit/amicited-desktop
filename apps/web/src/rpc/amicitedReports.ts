import { Atom } from "effect/reactivity";
import type { EnvironmentId } from "@t3tools/contracts";
import { reportChangeAtom } from "../reportChangeAtom";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";

export const reports = {
  links: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.links",
    label: "reports:links",
  }),
  list: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.list",
    label: "reports:list",
  }),
  get: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.get",
    label: "reports:get",
  }),
  create: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.create",
    label: "reports:create",
  }),
  update: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.update",
    label: "reports:update",
  }),
  archive: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.archive",
    label: "reports:archive",
  }),
  restore: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.restore",
    label: "reports:restore",
  }),
  delete: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.delete",
    label: "reports:delete",
  }),
  duplicate: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.duplicate",
    label: "reports:duplicate",
  }),
  run: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.run",
    label: "reports:run",
  }),
  snapshots: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.snapshots",
    label: "reports:snapshots",
  }),
  deleteSnapshot: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.deleteSnapshot",
    label: "reports:deleteSnapshot",
  }),
  edit: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.edit",
    label: "reports:edit",
  }),
  templates: createEnvironmentRpcCommand(connectionAtomRuntime, {
    tag: "amicited.reports.templates",
    label: "reports:templates",
  }),
};
export const reportChanges = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  tag: "amicited.reports.subscribe",
  label: "reports:changes",
  idleTtlMs: 0,
});

export const reportChangesForReport = Atom.family((key: string) => {
  const [environmentId, reportId] = JSON.parse(key) as [EnvironmentId, string];
  return reportChangeAtom(reportChanges({ environmentId, input: undefined }), reportId).pipe(
    Atom.setIdleTTL(0),
  );
});

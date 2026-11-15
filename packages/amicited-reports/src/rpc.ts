import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import { ReportSpec } from "./spec.ts";
const optional = Schema.optionalKey;
const Period = Schema.Struct({ start: Schema.String, end: Schema.String, label: Schema.String });
export const ReportSnapshotSummary = Schema.Struct({
  id: Schema.String,
  reportId: Schema.String,
  specRevision: Schema.Int,
  period: Period,
  comparison: Schema.NullOr(Period),
  status: Schema.Literals(["ready", "partial", "failed"]),
  errorCount: Schema.Int,
  narrative: Schema.Literals(["off", "writing", "ready", "failed"]),
  createdAt: Schema.String,
});
export type ReportSnapshotSummary = typeof ReportSnapshotSummary.Type;
const summaryFields = {
  id: Schema.String,
  projectId: Schema.String,
  title: Schema.String,
  specRevision: Schema.Int,
  threadId: Schema.NullOr(Schema.String),
  narrativeEnabled: Schema.Boolean,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  archivedAt: Schema.NullOr(Schema.String),
};
export const ReportSummary = Schema.Struct({
  ...summaryFields,
  lastSnapshot: Schema.NullOr(ReportSnapshotSummary),
});
export type ReportSummary = typeof ReportSummary.Type;
export const Report = Schema.Struct({ ...summaryFields, spec: ReportSpec });
export type Report = typeof Report.Type;
export const ReportSnapshot = Schema.Struct({
  id: Schema.String,
  reportId: Schema.String,
  specRevision: Schema.Int,
  spec: ReportSpec,
  period: Period,
  comparison: Schema.NullOr(Period),
  datasets: Schema.Record(Schema.String, Schema.Unknown),
  errors: Schema.Record(Schema.String, Schema.String),
  narrative: Schema.NullOr(Schema.Record(Schema.String, Schema.String)),
  narrativeThreadId: Schema.NullOr(Schema.String),
  narrativeRequested: Schema.Boolean,
  status: Schema.Literals(["ready", "partial", "failed"]),
  createdAt: Schema.String,
});
export type ReportSnapshot = typeof ReportSnapshot.Type;
export class ReportFailure extends Schema.TaggedError<
  ReportFailure,
  { readonly brand: unique symbol }
>()("ReportFailure", {
  message: Schema.String,
}) {}
export const ReportTemplate = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  spec: ReportSpec,
});
export const ReportChange = Schema.Struct({
  projectId: Schema.String,
  reportId: Schema.String,
  kind: Schema.Literals(["created", "updated", "deleted", "snapshot"]),
});
export const reportRpcs = [
  Rpc.make("amicited.reports.links", {
    payload: Schema.Union([
      Schema.Struct({ reportId: Schema.String }),
      Schema.Struct({ snapshotId: Schema.String }),
    ]),
    success: Schema.Struct({
      preview: optional(Schema.String),
      html: optional(Schema.String),
      pdf: optional(Schema.String),
      pptx: optional(Schema.String),
    }),
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.list", {
    payload: { projectId: optional(Schema.String), archived: optional(Schema.Boolean) },
    success: Schema.Array(ReportSummary),
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.get", {
    payload: { id: Schema.String },
    success: Report,
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.create", {
    payload: {
      projectId: Schema.String,
      title: Schema.String,
      templateId: optional(Schema.String),
    },
    success: Report,
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.update", {
    payload: {
      id: Schema.String,
      title: optional(Schema.String),
      spec: optional(ReportSpec),
      narrativeEnabled: optional(Schema.Boolean),
    },
    success: Report,
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.archive", {
    payload: { id: Schema.String },
    success: Report,
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.restore", {
    payload: { id: Schema.String },
    success: Report,
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.delete", {
    payload: { id: Schema.String },
    success: Schema.Void,
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.duplicate", {
    payload: { id: Schema.String, targetProjectId: Schema.String },
    success: Report,
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.run", {
    payload: { id: Schema.String },
    success: ReportSnapshotSummary,
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.snapshots", {
    payload: { reportId: Schema.String },
    success: Schema.Array(ReportSnapshotSummary),
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.deleteSnapshot", {
    payload: { id: Schema.String },
    success: Schema.Void,
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.edit", {
    payload: { id: Schema.String, request: optional(Schema.String) },
    success: Schema.Struct({ threadId: Schema.String, tabId: Schema.NullOr(Schema.String) }),
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.templates", {
    success: Schema.Array(ReportTemplate),
    error: ReportFailure,
  }),
  Rpc.make("amicited.reports.subscribe", {
    success: ReportChange,
    stream: true,
    error: ReportFailure,
  }),
] as const;

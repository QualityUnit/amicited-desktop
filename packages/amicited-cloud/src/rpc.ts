import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
export const CloudConnection = Schema.Union([
  Schema.Struct({ state: Schema.Literal("disconnected") }),
  Schema.Struct({ state: Schema.Literal("connecting") }),
  Schema.Struct({
    state: Schema.Literal("connected"),
    workspace: Schema.String,
    plan: Schema.optionalKey(Schema.String),
    access: Schema.optionalKey(Schema.Literals(["free", "full", "unknown"])),
    scopes: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    state: Schema.Literal("error"),
    kind: Schema.Literals(["auth", "plan_required", "no_credits", "rate_limited", "network"]),
    message: Schema.String,
  }),
]);
export class CloudApprovalExpired extends Schema.TaggedError<CloudApprovalExpired>()(
  "CloudApprovalExpired",
  { message: Schema.String },
) {}
const PendingApproval = Schema.Struct({
  requestId: Schema.String,
  threadId: Schema.String,
  tool: Schema.String,
  free: Schema.Boolean,
  readOnly: Schema.Boolean,
  arguments: Schema.Record(Schema.String, Schema.Unknown),
  message: Schema.String,
});
export class DomainFailure extends Schema.TaggedError<DomainFailure>()("DomainFailure", {
  message: Schema.String,
}) {}
export const DomainRecord = Schema.Struct({
  projectId: Schema.String,
  hostname: Schema.String,
  brand: Schema.String,
  connectionRef: Schema.String,
  domainId: Schema.optionalKey(Schema.String),
});
export const cloudRpcs = [
  Rpc.make("amicited.domains.list", { success: Schema.Array(DomainRecord), error: DomainFailure }),
  Rpc.make("amicited.domains.save", {
    payload: {
      projectId: Schema.String,
      website: Schema.String,
      brand: Schema.optionalKey(Schema.String),
    },
    success: DomainRecord,
    error: DomainFailure,
  }),
  Rpc.make("amicited.domains.status", {
    payload: { projectId: Schema.String },
    success: CloudConnection,
    error: DomainFailure,
  }),
  Rpc.make("amicited.domains.reuse", {
    payload: { projectId: Schema.String, sourceProjectId: Schema.String },
    success: CloudConnection,
    error: DomainFailure,
  }),
  Rpc.make("amicited.domains.connection", {
    payload: {
      projectId: Schema.String,
      action: Schema.Literals(["status", "oauth", "disconnect"]),
      apiKey: Schema.optionalKey(Schema.String),
    },
    success: CloudConnection,
    error: DomainFailure,
  }),

  Rpc.make("amicited.cloud.subscribeApprovals", {
    success: Schema.Array(PendingApproval),
    stream: true,
  }),
  Rpc.make("amicited.cloud.pendingApprovals", {
    success: Schema.Array(PendingApproval),
  }),
  Rpc.make("amicited.cloud.resetAccess", { success: CloudConnection }),
  Rpc.make("amicited.cloud.answerApproval", {
    payload: {
      requestId: Schema.String,
      decision: Schema.Literals(["decline", "accept", "acceptForSession"]),
    },
    success: Schema.Unknown,
    error: CloudApprovalExpired,
  }),
  Rpc.make("amicited.cloud.status", { success: CloudConnection }),
  Rpc.make("amicited.cloud.connectOAuth", { success: CloudConnection }),
  Rpc.make("amicited.cloud.connectApiKey", {
    payload: { apiKey: Schema.String },
    success: CloudConnection,
  }),
  Rpc.make("amicited.cloud.disconnect", { success: CloudConnection }),
  Rpc.make("amicited.cloud.summary", {
    success: Schema.Struct({
      connection: CloudConnection,
      domains: Schema.optionalKey(
        Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
      ),
      analytics: Schema.optionalKey(Schema.Unknown),
      headlines: Schema.optionalKey(
        Schema.Array(
          Schema.Struct({
            label: Schema.String,
            value: Schema.Union([Schema.String, Schema.Number]),
          }),
        ),
      ),
      reportUrl: Schema.optionalKey(Schema.String),
    }),
  }),
] as const;

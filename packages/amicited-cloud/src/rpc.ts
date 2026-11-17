import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
export const CloudConnection = Schema.Union([
  Schema.Struct({ state: Schema.Literal("disconnected") }),
  Schema.Struct({ state: Schema.Literal("connecting") }),
  Schema.Struct({
    state: Schema.Literal("connected"),
    auth: Schema.optionalKey(Schema.Literals(["apiKey", "oauth"])),
    workspace: Schema.String,
    plan: Schema.optionalKey(Schema.String),
    access: Schema.optionalKey(Schema.Literals(["free", "full", "unknown"])),
    scopes: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    state: Schema.Literal("error"),
    kind: Schema.Literals(["auth", "plan_required", "no_credits", "rate_limited", "network"]),
    message: Schema.String,
    code: Schema.optionalKey(Schema.String),
    description: Schema.optionalKey(Schema.String),
    actionUrl: Schema.optionalKey(Schema.String),
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
export const Cms = Schema.Literals([
  "wordpress",
  "webflow",
  "shopify",
  "wix",
  "squarespace",
  "hubspot",
  "ghost",
  "headless",
  "git",
  "unknown",
]);
const SiteMetadata = {
  cms: Schema.optionalKey(Cms),
  siteFiles: Schema.optionalKey(Schema.NullOr(Schema.String)),
  framework: Schema.optionalKey(Schema.NullOr(Schema.String)),
};
export const DomainRecord = Schema.Struct({
  projectId: Schema.String,
  hostname: Schema.String,
  brand: Schema.String,
  connectionRef: Schema.String,
  ...SiteMetadata,
  domainId: Schema.optionalKey(Schema.String),
  workspaceId: Schema.optionalKey(Schema.String),
});
const SetupState = Schema.Struct({
  finished: Schema.Boolean,
  lastDomain: Schema.optionalKey(Schema.String),
});
export const AccountWorkspace = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  userName: Schema.String,
  plan: Schema.String,
  access: Schema.Literals(["free", "full", "unknown"]),
  sessionEnded: Schema.Boolean,
  attentionCount: Schema.Number,
  websites: Schema.Array(Schema.String),
  projectIds: Schema.optionalKey(Schema.Array(Schema.String)),
});
export const AccountStatus = Schema.Struct({
  state: Schema.Literals(["signed_out", "signed_in", "session_ended"]),
  workspaces: Schema.Array(AccountWorkspace),
  currentWorkspaceId: Schema.optionalKey(Schema.String),
  signingIn: Schema.Boolean,
  error: Schema.optionalKey(Schema.String),
});
export const cloudRpcs = [
  Rpc.make("amicited.account.status", { success: AccountStatus, error: DomainFailure }),
  Rpc.make("amicited.account.subscribe", { success: AccountStatus, stream: true }),
  ...(["addWorkspace", "cancelSignIn", "reopenSignIn", "signOut"] as const).map((method) =>
    Rpc.make(`amicited.account.${method}`, { success: AccountStatus, error: DomainFailure }),
  ),
  ...(["switchWorkspace", "removeWorkspace"] as const).map((method) =>
    Rpc.make(`amicited.account.${method}`, {
      payload: { workspaceId: Schema.String },
      success: AccountStatus,
      error: DomainFailure,
    }),
  ),
  Rpc.make("amicited.domains.older", { success: Schema.Array(DomainRecord), error: DomainFailure }),
  Rpc.make("amicited.domains.adopt", {
    payload: { projectId: Schema.String },
    success: DomainRecord,
    error: DomainFailure,
  }),
  Rpc.make("amicited.domains.listCloud", { success: Schema.Unknown, error: DomainFailure }),
  Rpc.make("amicited.setup.read", { success: SetupState, error: DomainFailure }),
  Rpc.make("amicited.setup.write", {
    payload: SetupState,
    success: Schema.Void,
    error: DomainFailure,
  }),
  Rpc.make("amicited.domains.inspect", {
    payload: { path: Schema.String },
    success: Schema.Struct({ git: Schema.Boolean, framework: Schema.NullOr(Schema.String) }),
    error: DomainFailure,
  }),
  Rpc.make("amicited.domains.list", { success: Schema.Array(DomainRecord), error: DomainFailure }),
  Rpc.make("amicited.domains.save", {
    payload: {
      projectId: Schema.String,
      website: Schema.String,
      ...SiteMetadata,
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
  Rpc.make("amicited.cloud.resetAccess", {
    payload: { projectId: Schema.optionalKey(Schema.String) },
    success: CloudConnection,
  }),
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

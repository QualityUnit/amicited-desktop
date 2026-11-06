import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
export const CloudConnection = Schema.Union([
  Schema.Struct({ state: Schema.Literal("disconnected") }),
  Schema.Struct({ state: Schema.Literal("connecting") }),
  Schema.Struct({
    state: Schema.Literal("connected"),
    workspace: Schema.String,
    plan: Schema.optionalKey(Schema.String),
    scopes: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    state: Schema.Literal("error"),
    kind: Schema.Literals(["auth", "plan_required", "no_credits", "rate_limited", "network"]),
    message: Schema.String,
  }),
]);
export const cloudRpcs = [
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
      domains: Schema.optionalKey(Schema.Unknown),
      analytics: Schema.optionalKey(Schema.Unknown),
      headlines: Schema.optionalKey(Schema.Unknown),
      reportUrl: Schema.optionalKey(Schema.String),
    }),
  }),
] as const;

import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
export class ConnectionFailure extends Schema.TaggedError<ConnectionFailure>()(
  "ConnectionFailure",
  { message: Schema.String },
) {}
export const ConnectionId = Schema.Literals([
  "chatgpt",
  "perplexity",
  "gemini",
  "claude",
  "google",
  "meta_muse",
  "grok",
  "deepseek",
  "linkedin",
]);
export type ConnectionId = typeof ConnectionId.Type;
export const ConnectionStatus = Schema.Literals([
  "connected",
  "signed_out",
  "needs_attention",
  "not_set_up",
]);
export const Connection = Schema.Struct({
  id: ConnectionId,
  status: ConnectionStatus,
  reconnectedAt: Schema.optionalKey(Schema.String),
  lastChecked: Schema.NullOr(Schema.String),
  lastUsed: Schema.NullOr(Schema.String),
  usedBy: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      label: Schema.String,
      projectId: Schema.optionalKey(Schema.String),
    }),
  ),
  signingIn: Schema.Boolean,
  tabId: Schema.optionalKey(Schema.String),
  threadId: Schema.optionalKey(Schema.String),
});
export const ConnectionRequest = Schema.Struct({
  threadId: Schema.String,
  connectionId: ConnectionId,
  message: Schema.String,
});
export const ConnectionsSnapshot = Schema.Struct({
  connections: Schema.Array(Connection),
  requests: Schema.Array(ConnectionRequest),
  usage: Schema.NullOr(Schema.Struct({ used: Schema.Number, limit: Schema.Number })),
});
export type ConnectionsSnapshot = typeof ConnectionsSnapshot.Type;
export const connectionRpcs = [
  Rpc.make("amicited.connections.subscribe", { success: ConnectionsSnapshot, stream: true }),
  Rpc.make("amicited.connections.status", {
    success: ConnectionsSnapshot,
    error: ConnectionFailure,
  }),
  ...(["check", "disconnect", "cancel", "finish"] as const).map((method) =>
    Rpc.make(`amicited.connections.${method}`, {
      payload: { connectionId: ConnectionId },
      success: ConnectionsSnapshot,
      error: ConnectionFailure,
    }),
  ),
  Rpc.make("amicited.connections.connect", {
    payload: { connectionId: ConnectionId, threadId: Schema.String },
    success: ConnectionsSnapshot,
    error: ConnectionFailure,
  }),
];

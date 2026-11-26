import { Connections } from "./Connections.ts";
import { ConnectionId } from "@amicited/cloud-client/connectionsRpc";
import { jsonToolResult } from "./toolResult.ts";
import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import { AmicitedCloud } from "./Cloud.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../mcp/McpToolAccess.ts";
import { readCaller, assertLiveCaller } from "../mcp/threadAccess.ts";
const shared = {
  success: Schema.Unknown,
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    ThreadManagement.ThreadManagementService,
    AmicitedCloud,
    Connections,
    McpInvocationContext.McpInvocationContext,
  ],
};
export const CloudToolkit = Toolkit.make(
  Tool.make("amicited_connection", {
    ...shared,
    description:
      "Check browser connection status or request that the user sign in through an inline chat card. This never signs in or posts automatically. LinkedIn is coming soon; posting will require approval. Use one Google connection for AI Overviews and AI Mode.",
    parameters: Schema.Struct({
      action: Schema.Literals(["status", "request"]),
      connectionId: ConnectionId,
    }),
  }),
  Tool.make("amicited_cloud_discover", {
    ...shared,
    description:
      "Discover real AmICited tools through list_toolsets, search_tools and describe_tool. Read the selected tool's schema before calling it with amicited_cloud_call. Credentials stay on the server. If disconnected, connect in Settings.",
    parameters: Schema.Struct({
      tool: Schema.Literals(["list_toolsets", "search_tools", "describe_tool"]),
      arguments: Schema.Record(Schema.String, Schema.Unknown),
    }),
  }).annotate(Tool.Readonly, true),
  Tool.make("amicited_cloud_call", {
    ...shared,
    description:
      "Call a discovered AmICited tool using its schema, including free_* tools. Free checks need no paid plan but spend workspace credits; welcome credits cover new accounts. Run requested tools directly and mention credit use in your reply. In Full access, reads and writes run immediately; destructive actions still ask once. Ask before acting mode uses app approvals and chat grants. A plan refusal leaves free checks available.",
    parameters: Schema.Struct({
      tool: Schema.String,
      arguments: Schema.Record(Schema.String, Schema.Unknown),
      approved: Schema.optionalKey(Schema.Boolean),
    }),
  }),
);
const call = Effect.fn("AmicitedCloud.proxy")(function* (
  tool: string,
  args: Record<string, unknown>,
) {
  const caller = yield* readCaller();
  const root = yield* AmicitedCloud;
  yield* Effect.promise(() => root.domains?.list() ?? Promise.resolve([]));
  const cloud = root.forProject(caller.caller?.projectId);
  const result = yield* Effect.tryPromise({
    try: () => cloud.call(tool, args),
    catch: () =>
      new OrchestratorMcpFailure({
        code: "provider_unavailable",
        message: "Could not use AmICited. Check the connection in Settings and try again.",
      }),
  });
  return { kind: "amicited-cloud-result", tool, result };
});
const guardedCall = Effect.fn("AmicitedCloud.guardedCall")(function* (params: {
  tool: string;
  arguments: Record<string, unknown>;
  approved?: boolean;
}) {
  const caller = yield* readCaller();
  yield* assertLiveCaller(caller);
  const root = yield* AmicitedCloud;
  yield* Effect.promise(() => root.domains?.list() ?? Promise.resolve([]));
  const cloud = root.forProject(caller.caller?.projectId);
  if (!caller.scope.thread)
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Run AmICited actions from a thread so the user can approve them.",
    });
  if (caller.caller?.projectId)
    root.domains?.bindThread(caller.caller.projectId, caller.scope.thread.threadId);
  const result = yield* Effect.tryPromise({
    try: async (signal) => {
      const policy = await cloud.toolPolicy(params.tool);
      if (
        caller.scope.client?.access === "read-only" &&
        (policy.needsApproval || !params.tool.startsWith("free_"))
      )
        return {
          isError: true,
          structuredContent: {
            code: "capability_denied",
            message: "This client can only read free AmICited results.",
          },
        };
      return cloud.requestCall(
        caller.scope.thread!.threadId,
        params.tool,
        params.arguments,
        signal,
        caller.limits.runtimeMode,
      );
    },
    catch: () =>
      new OrchestratorMcpFailure({
        code: "provider_unavailable",
        message:
          "Could not check this AmICited tool. Check your connection and discover its name first.",
      }),
  });
  if (params.tool === "list_domains" && caller.caller?.projectId)
    yield* Effect.promise(
      () => root.domains?.rememberDomain(caller.caller!.projectId, result) ?? Promise.resolve(),
    ).pipe(Effect.ignoreCause({ log: true }));
  return {
    kind: "amicited-cloud-result",
    tool: params.tool,
    arguments: params.arguments,
    target: cloud.target(caller.scope.thread.threadId, params.tool, params.arguments),
    result,
  };
});
export const layer = McpToolAccess.toLayer(CloudToolkit, {
  amicited_connection: McpToolAccess.readsAsCaller((params) =>
    Effect.gen(function* () {
      const caller = yield* readCaller();
      yield* assertLiveCaller(caller);
      const connections = yield* Connections;
      if (params.action === "status")
        return yield* jsonToolResult(
          connections.engine.snapshot().connections.find((c) => c.id === params.connectionId),
        );
      if (caller.scope.client?.access === "read-only")
        return yield* new OrchestratorMcpFailure({
          code: "capability_denied",
          message: "This client can only read connection status.",
        });
      const threadId = caller.scope.thread?.threadId;
      if (!threadId)
        return yield* new OrchestratorMcpFailure({
          code: "invalid_request",
          message: "Request a connection from a chat.",
        });
      const row = connections.engine.requestConnection(
        threadId,
        params.connectionId,
        params.connectionId === "linkedin"
          ? "Connect LinkedIn to post this"
          : `Sign in to ${params.connectionId} again to continue`,
      );
      return yield* jsonToolResult({ connection: row, requested: true });
    }),
  ),
  amicited_cloud_discover: McpToolAccess.reads(({ tool, arguments: args }) =>
    call(tool, args).pipe(Effect.flatMap(jsonToolResult)),
  ),
  amicited_cloud_call: McpToolAccess.reads((params) =>
    guardedCall(params).pipe(Effect.flatMap(jsonToolResult)),
  ),
});

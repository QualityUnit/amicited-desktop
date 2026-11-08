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
    McpInvocationContext.McpInvocationContext,
  ],
};
export const CloudToolkit = Toolkit.make(
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
      "Call a discovered AmICited tool using its schema, including free_* tools. Free checks need no paid plan but spend workspace credits; welcome credits cover new accounts. Only users approve: the app asks for writes and paid calls. Chat grants cover free checks or paid reads, never other writes or destructive actions. A plan refusal leaves free checks available.",
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
  yield* readCaller();
  const cloud = yield* AmicitedCloud;
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
  const cloud = yield* AmicitedCloud;
  if (!caller.scope.thread)
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Run AmICited actions from a thread so the user can approve them.",
    });
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
      );
    },
    catch: () =>
      new OrchestratorMcpFailure({
        code: "provider_unavailable",
        message:
          "Could not check this AmICited tool. Check your connection and discover its name first.",
      }),
  });
  return { kind: "amicited-cloud-result", tool: params.tool, arguments: params.arguments, result };
});
export const layer = McpToolAccess.toLayer(CloudToolkit, {
  amicited_cloud_discover: McpToolAccess.reads(({ tool, arguments: args }) => call(tool, args)),
  amicited_cloud_call: McpToolAccess.reads(guardedCall),
});

import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import { AmicitedCloud } from "./Cloud.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../mcp/McpToolAccess.ts";
import { readCaller } from "../mcp/threadAccess.ts";
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
      "Call a real AmICited tool by name with its advertised arguments, including free_* tools. Server annotations decide whether approval is required. First call with approved=false. If approval is required, explain the action and cost and obtain the user's approval before repeating with approved=true. A trial or paid-tool refusal leaves free tools available.",
    parameters: Schema.Struct({
      tool: Schema.String,
      arguments: Schema.Record(Schema.String, Schema.Unknown),
      approved: Schema.Boolean,
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
  approved: boolean;
}) {
  yield* readCaller();
  const cloud = yield* AmicitedCloud;
  const policy = yield* Effect.tryPromise({
    try: () => cloud.toolPolicy(params.tool),
    catch: () =>
      new OrchestratorMcpFailure({
        code: "provider_unavailable",
        message:
          "Could not check this AmICited tool. Check your connection and discover its name first.",
      }),
  });
  if (policy.needsApproval && !params.approved)
    return {
      kind: "approval_required",
      tool: params.tool,
      message: "Ask the user to approve this action and its cost before running it.",
    };
  return yield* call(params.tool, params.arguments);
});
export const layer = McpToolAccess.toLayer(CloudToolkit, {
  amicited_cloud_discover: McpToolAccess.reads(({ tool, arguments: args }) => call(tool, args)),
  amicited_cloud_call: McpToolAccess.either(
    (params) => params.approved,
    McpToolAccess.writesEnvironment((params, check) =>
      check.pipe(Effect.andThen(guardedCall(params))),
    ),
    McpToolAccess.reads(guardedCall),
  ),
});

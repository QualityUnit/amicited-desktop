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
  Tool.make("amicited_cloud_read", {
    ...shared,
    description:
      "Read the connected AmICited workspace. Discover tools with search_tools and describe_tool; read_tool runs read-only tools. If disconnected, ask the user to connect in Settings. Credentials are kept by the server.",
    parameters: Schema.Struct({
      tool: Schema.Literals([
        "list_domains",
        "list_prompts",
        "list_competitors",
        "list_tags",
        "prompt_analytics",
        "report_link",
        "list_toolsets",
        "search_tools",
        "describe_tool",
        "read_tool",
      ]),
      arguments: Schema.Record(Schema.String, Schema.Unknown),
    }),
  }).annotate(Tool.Readonly, true),
  Tool.make("amicited_cloud_run", {
    ...shared,
    description:
      "Run an AmICited workspace tool through run_tool. This may publish content or spend credits. Obtain the user's approval for the action and its cost first. Use amicited_cloud_read for read-only operations.",
    parameters: Schema.Struct({ arguments: Schema.Record(Schema.String, Schema.Unknown) }),
  }).annotate(Tool.Destructive, true),
);
const call = Effect.fn("AmicitedCloud.proxy")(function* (
  tool: string,
  args: Record<string, unknown>,
) {
  yield* readCaller();
  const cloud = yield* AmicitedCloud;
  return yield* Effect.tryPromise({
    try: () => cloud.call(tool, args),
    catch: () =>
      new OrchestratorMcpFailure({
        code: "provider_unavailable",
        message: "Could not use AmICited. Check the connection in Settings and try again.",
      }),
  });
});
export const layer = McpToolAccess.toLayer(CloudToolkit, {
  amicited_cloud_read: McpToolAccess.reads(({ tool, arguments: args }) => call(tool, args)),
  amicited_cloud_run: McpToolAccess.writesEnvironment(({ arguments: args }, check) =>
    check.pipe(Effect.andThen(call("run_tool", args))),
  ),
});

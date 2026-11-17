import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../mcp/McpToolAccess.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import { readCaller } from "../mcp/threadAccess.ts";
import { Tracking } from "./Tracking.ts";
import { jsonToolResult } from "./toolResult.ts";
export const TrackingToolkit = Toolkit.make(
  Tool.make("amicited_tracking", {
    success: Schema.Unknown,
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    description:
      "Read local AI visibility answers for this domain, or start today's check in the user's signed-in browser. Progress is available by reading again. Requires saved tracking prompts; sign-in failures need the user's action in Connections.",
    parameters: Schema.Struct({ action: Schema.Literals(["results", "run"]) }),
    dependencies: [
      Tracking,
      ThreadManagement.ThreadManagementService,
      McpInvocationContext.McpInvocationContext,
    ],
  }),
);
const call = Effect.fn("Tracking.mcp")(
  function* (action: "results" | "run") {
    const caller = yield* readCaller();
    const projectId = caller.caller?.projectId;
    if (!projectId)
      return yield* new OrchestratorMcpFailure({
        code: "invalid_request",
        message: "Run this from a domain's thread.",
      });
    const tracking = yield* Tracking;
    if (action === "run") return { runId: yield* tracking.runNow(projectId) };
    const s = yield* tracking.snapshot();
    return {
      country: s.country,
      config: s.configs.find((c) => c.projectId === projectId),
      runs: s.runs.filter((r) => r.projectId === projectId),
    };
  },
  Effect.mapError(
    () =>
      new OrchestratorMcpFailure({
        code: "invalid_request",
        message: "Could not read or run local tracking.",
      }),
  ),
);
export const layer = McpToolAccess.toLayer(TrackingToolkit, {
  amicited_tracking: McpToolAccess.writes((p) =>
    call(p.action).pipe(Effect.flatMap(jsonToolResult)),
  ),
});

import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../mcp/McpToolAccess.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import { assertLiveCaller } from "../mcp/threadAccess.ts";
import { assertNotLinked } from "../mcp/linkOrigin.ts";
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
    parameters: Schema.Struct({
      action: Schema.Literals(["results", "run"]),
      runId: Schema.optionalKey(Schema.String),
    }),
    dependencies: [
      Tracking,
      ThreadManagement.ThreadManagementService,
      McpInvocationContext.McpInvocationContext,
    ],
  }),
);
const call = Effect.fn("Tracking.mcp")(
  function* (action: "results" | "run", runId?: string) {
    const caller = yield* readCaller();
    const projectId = caller.caller?.projectId;
    if (!projectId)
      return yield* new OrchestratorMcpFailure({
        code: "invalid_request",
        message: "Run this from a domain's thread.",
      });
    const tracking = yield* Tracking;
    if (action === "run") {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      if (scope.client?.access === "read-only")
        return yield* new OrchestratorMcpFailure({
          code: "capability_denied",
          message: "This client has read-only access.",
        });
      yield* assertLiveCaller(caller);
      yield* assertNotLinked(caller, "run local tracking");
      return { runId: yield* tracking.runNow(projectId) };
    }
    const s = yield* tracking.snapshot();
    const selected = runId
      ? [yield* tracking.detail(runId)]
      : yield* Effect.forEach(
          s.runs.filter((r) => r.projectId === projectId),
          (r) => tracking.detail(r.id),
        );
    return {
      country: s.country,
      config: s.configs.find((c) => c.projectId === projectId),
      runs: selected.filter((r) => r?.projectId === projectId),
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
  amicited_tracking: McpToolAccess.reads((p) =>
    call(p.action, p.runId).pipe(Effect.flatMap(jsonToolResult)),
  ),
});

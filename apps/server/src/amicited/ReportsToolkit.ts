import { ReportFailure } from "@amicited/reports/rpc";
import { expressionError } from "@amicited/reports/expressions";
import * as ReportsEditing from "./ReportsEditing.ts";
import { Tool, Toolkit } from "effect/ai";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OrchestratorMcpFailure } from "@t3tools/contracts";
import { ReportSpec } from "@amicited/reports/spec";
import * as Reports from "./Reports.ts";
import * as ReportsApi from "./ReportsApi.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Invocation from "../mcp/McpInvocationContext.ts";
import * as Access from "../mcp/McpToolAccess.ts";
import { readCaller, assertLiveCaller } from "../mcp/threadAccess.ts";
import { jsonToolResult } from "./toolResult.ts";
const isReportFailure = Schema.is(ReportFailure);

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const shared = {
  success: Schema.Unknown,
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    ReportsEditing.ReportsEditing,
    Reports.Reports,
    ReportsApi.ReportsApi,
    Threads.ThreadManagementService,
    Invocation.McpInvocationContext,
  ],
};
export const ReportsToolkit = Toolkit.make(
  Tool.make("reports_list", {
    ...shared,
    description: "List reports for this chat's domain.",
    parameters: Tool.EmptyParams,
  }).annotate(Tool.Readonly, true),
  Tool.make("report_get", {
    ...shared,
    description:
      "Read a report spec in this domain. report_save defines the spec schema; the preview is open in the browser panel.",
    parameters: Schema.Struct({ id: Schema.String }),
  }).annotate(Tool.Readonly, true),
  Tool.make("report_save", {
    ...shared,
    description:
      "Validate and save a complete report spec, dry-run queries and refresh its live preview.",
    parameters: Schema.Struct({ id: Schema.String, spec: ReportSpec }),
  }),
  Tool.make("report_run", {
    ...shared,
    description: "Run a domain report and freeze a new snapshot.",
    parameters: Schema.Struct({ id: Schema.String }),
  }),
  Tool.make("report_api", {
    ...shared,
    description:
      "Search GET report endpoints, describe their response schemas, or call one. Domain and workspace ids are injected; credentials remain private.",
    parameters: Schema.Struct({
      action: Schema.Literals(["search", "describe", "call"]),
      query: Schema.String,
      params: Schema.optionalKey(
        Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
      ),
    }),
  }).annotate(Tool.Readonly, true),
  Tool.make("report_narrative_submit", {
    ...shared,
    description: "Submit one commentary block for a snapshot assigned to this chat.",
    parameters: Schema.Struct({
      snapshotId: Schema.String,
      blockId: Schema.String,
      markdown: Schema.String,
    }),
    // Like html_render: writes only the caller's own commentary, so unattended runs never wait.
  }).annotate(Tool.Readonly, true),
);
const caller = Effect.gen(function* () {
  const c = yield* readCaller();
  yield* assertLiveCaller(c);
  if (!c.caller || !c.scope.thread)
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Use reports from a domain chat.",
    });
  return { projectId: c.caller.projectId, threadId: c.scope.thread.threadId };
});
const safe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError(
      (error) =>
        new OrchestratorMcpFailure({
          code: "invalid_request",
          message: isReportFailure(error) ? error.message : expressionError(error),
        }),
    ),
    Effect.flatMap(jsonToolResult),
  );
export const layer = Access.toLayer(ReportsToolkit, {
  reports_list: Access.readsAsCaller(() =>
    safe(
      Effect.gen(function* () {
        const c = yield* caller;
        return yield* (yield* Reports.Reports).list(c.projectId);
      }),
    ),
  ),
  report_get: Access.readsAsCaller(({ id }) =>
    safe(
      Effect.gen(function* () {
        const c = yield* caller;
        const report = yield* (yield* Reports.Reports).get(id, c.projectId);
        return {
          report,
        };
      }),
    ),
  ),
  report_save: Access.actsAsCaller(({ id, spec }) =>
    safe(
      Effect.gen(function* () {
        const c = yield* caller;
        const reports = yield* Reports.Reports;
        yield* reports.update({ id, spec }, c.projectId);
        return yield* reports.validate(id, c.projectId);
      }),
    ),
  ),
  report_run: Access.actsAsCaller(({ id }) =>
    safe(
      Effect.gen(function* () {
        const c = yield* caller;
        return yield* (yield* ReportsEditing.ReportsEditing).run(id, c.projectId);
      }),
    ),
  ),
  report_api: Access.readsAsCaller(({ action, query, params }) =>
    safe(
      Effect.gen(function* () {
        const c = yield* caller;
        const api = yield* ReportsApi.ReportsApi;
        if (action !== "call") return yield* api.catalog(action, query);
        const value = yield* api.get(c.projectId, query, params ?? {});
        const text = encodeJson(value);
        return {
          shape: Array.isArray(value)
            ? "array"
            : value === null
              ? "null"
              : typeof value === "object"
                ? Object.keys(value)
                : typeof value,
          response: text.slice(0, 20000),
          truncated: text.length > 20000,
        };
      }),
    ),
  ),
  report_narrative_submit: Access.actsAsCaller((input) =>
    safe(
      Effect.gen(function* () {
        const c = yield* caller;
        yield* (yield* Reports.Reports).narrativeSubmit(
          input.snapshotId,
          input.blockId,
          input.markdown,
          c.projectId,
          c.threadId,
        );
        return { saved: true };
      }),
    ),
  ),
});

import { IssueEffort, IssueKind, IssuePriority, IssueStatus } from "@amicited/cloud-client/issues";
import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../mcp/McpToolAccess.ts";
import { readCaller } from "../mcp/threadAccess.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import { AmicitedIssues, type IssueUpsert } from "./Issues.ts";
import { jsonToolResult } from "./toolResult.ts";

const shared = {
  success: Schema.Unknown,
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    ThreadManagement.ThreadManagementService,
    AmicitedIssues,
    McpInvocationContext.McpInvocationContext,
  ],
};

export const IssuesToolkit = Toolkit.make(
  Tool.make("issues_list", {
    ...shared,
    description: "List this domain's website issues, most important first. Default: open.",
    parameters: Schema.Struct({
      status: Schema.optionalKey(Schema.Union([IssueStatus, Schema.Literal("all")])),
    }),
  }).annotate(Tool.Readonly, true),
  Tool.make("issue_upsert", {
    ...shared,
    description:
      "Add a website issue for this domain, or update the one with the same fingerprint. kind connect: a report to connect. Body: evidence and fix steps in Markdown.",
    parameters: Schema.Struct({
      fingerprint: Schema.String.annotate({ description: "Stable key, e.g. report:check:scope." }),
      kind: IssueKind,
      title: Schema.String,
      body: Schema.String,
      report: Schema.String.annotate({ description: "AmICited report it came from." }),
      priority: IssuePriority,
      effort: Schema.optionalKey(IssueEffort),
    }),
  }),
  Tool.make("issue_set_status", {
    ...shared,
    description:
      "Mark an issue done, dismissed or open again. Omit issueId for the issue this thread works on.",
    parameters: Schema.Struct({
      issueId: Schema.optionalKey(Schema.String),
      status: IssueStatus,
      resolution: Schema.optionalKey(
        Schema.Literals(["agent", "audit"]).annotate({
          description: "audit: a report no longer shows it. Default agent.",
        }),
      ),
    }),
  }),
);

const failure = (message: string) =>
  new OrchestratorMcpFailure({ code: "invalid_request", message });

const callerProject = Effect.fn("AmicitedIssues.callerProject")(function* () {
  const caller = yield* readCaller();
  const projectId = caller.caller?.projectId;
  if (!projectId) return yield* failure("Run this from a thread in a domain.");
  return { projectId: projectId as string, threadId: caller.scope.thread?.threadId };
});

const asFailure = <A, R>(effect: Effect.Effect<A, { readonly message: string }, R>) =>
  effect.pipe(Effect.mapError((error) => failure(error.message)));

const list = Effect.fn("AmicitedIssues.mcpList")(function* (params: {
  status?: IssueStatus | "all";
}) {
  const { projectId } = yield* callerProject();
  const issues = yield* asFailure((yield* AmicitedIssues).list(projectId, params.status ?? "open"));
  return { issues };
});

const upsert = Effect.fn("AmicitedIssues.mcpUpsert")(function* (params: IssueUpsert) {
  const { projectId } = yield* callerProject();
  return yield* asFailure((yield* AmicitedIssues).upsert(projectId, params));
});

const setStatus = Effect.fn("AmicitedIssues.mcpSetStatus")(function* (params: {
  issueId?: string;
  status: IssueStatus;
  resolution?: "agent" | "audit";
}) {
  const { projectId, threadId } = yield* callerProject();
  const issues = yield* AmicitedIssues;
  const issue =
    params.issueId !== undefined
      ? (yield* asFailure(issues.list(projectId, "all"))).find((row) => row.id === params.issueId)
      : threadId
        ? yield* asFailure(issues.forThread(threadId))
        : null;
  if (!issue || issue.projectId !== projectId)
    return yield* failure("No such issue for this domain. Pass issueId from issues_list.");
  return yield* asFailure(
    issues.update({
      id: issue.id,
      status: params.status,
      resolution: params.resolution ?? "agent",
    }),
  );
});

export const layer = McpToolAccess.toLayer(IssuesToolkit, {
  issues_list: McpToolAccess.readsAsCaller((params) =>
    list(params).pipe(Effect.flatMap(jsonToolResult)),
  ),
  issue_upsert: McpToolAccess.writes((params) =>
    upsert(params).pipe(Effect.flatMap(jsonToolResult)),
  ),
  issue_set_status: McpToolAccess.writes((params) =>
    setStatus(params).pipe(Effect.flatMap(jsonToolResult)),
  ),
});

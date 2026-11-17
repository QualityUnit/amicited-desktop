import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";

export const IssueKind = Schema.Literals(["connect", "fix"]);
export type IssueKind = typeof IssueKind.Type;
export const IssuePriority = Schema.Literals(["high", "medium", "low"]);
export type IssuePriority = typeof IssuePriority.Type;
export const IssueEffort = Schema.Literals(["small", "medium", "large"]);
export type IssueEffort = typeof IssueEffort.Type;
/** In progress and review are read from the linked thread, so only these are stored. */
export const IssueStatus = Schema.Literals(["open", "done", "dismissed"]);
export type IssueStatus = typeof IssueStatus.Type;
/** Who closed it; `audit` means a later audit no longer found the problem. */
export const IssueResolution = Schema.Literals(["user", "agent", "audit"]);
export type IssueResolution = typeof IssueResolution.Type;

export const IssueEvidence = Schema.Struct({
  affectedPromptCount: Schema.Number,
  questions: Schema.Array(Schema.String),
  destination: Schema.String,
});
export const Issue = Schema.Struct({
  evidence: Schema.optionalKey(IssueEvidence),
  id: Schema.String,
  projectId: Schema.String,
  fingerprint: Schema.String,
  kind: IssueKind,
  title: Schema.String,
  body: Schema.String,
  report: Schema.String,
  priority: IssuePriority,
  effort: Schema.NullOr(IssueEffort),
  status: IssueStatus,
  resolution: Schema.NullOr(IssueResolution),
  threadId: Schema.NullOr(Schema.String),
  firstSeenAt: Schema.String,
  lastSeenAt: Schema.String,
  resolvedAt: Schema.NullOr(Schema.String),
  updatedAt: Schema.String,
});
export type Issue = typeof Issue.Type;

export const IssueAudit = Schema.Struct({
  projectId: Schema.String,
  taskId: Schema.String,
  enabled: Schema.Boolean,
  timeOfDay: Schema.String,
  instructions: Schema.String,
  threadId: Schema.NullOr(Schema.String),
  nextRunAt: Schema.NullOr(Schema.String),
  lastRunAt: Schema.NullOr(Schema.String),
  lastRunStatus: Schema.String,
  lastRunError: Schema.NullOr(Schema.String),
});
export type IssueAudit = typeof IssueAudit.Type;

export const IssuesSnapshot = Schema.Struct({
  issues: Schema.Array(Issue),
  audits: Schema.Array(IssueAudit),
});
export type IssuesSnapshot = typeof IssuesSnapshot.Type;

export class IssueFailure extends Schema.TaggedError<IssueFailure>()("IssueFailure", {
  message: Schema.String,
}) {}

const TimeOfDay = Schema.String.check(Schema.isPattern(/^([01]?\d|2[0-3]):[0-5]\d$/));

export const issueRpcs = [
  Rpc.make("amicited.issues.subscribe", {
    success: IssuesSnapshot,
    error: IssueFailure,
    stream: true,
  }),
  Rpc.make("amicited.issues.update", {
    payload: {
      id: Schema.String,
      status: Schema.optionalKey(IssueStatus),
      threadId: Schema.optionalKey(Schema.NullOr(Schema.String)),
    },
    success: Issue,
    error: IssueFailure,
  }),
  Rpc.make("amicited.issues.configureAudit", {
    payload: {
      projectId: Schema.String,
      enabled: Schema.Boolean,
      timeOfDay: Schema.optionalKey(TimeOfDay),
      instructions: Schema.optionalKey(Schema.String),
    },
    success: IssueAudit,
    error: IssueFailure,
  }),
  Rpc.make("amicited.issues.runAudit", {
    payload: { projectId: Schema.String },
    success: IssueAudit,
    error: IssueFailure,
  }),
] as const;

const priorityRank: Record<IssuePriority, number> = { high: 0, medium: 1, low: 2 };

/** Connect issues first, as an unconnected report hides every problem it would find. */
export function compareIssues(a: Issue, b: Issue): number {
  if (a.kind !== b.kind) return a.kind === "connect" ? -1 : 1;
  const priority = priorityRank[a.priority] - priorityRank[b.priority];
  if (priority !== 0) return priority;
  return a.firstSeenAt < b.firstSeenAt ? -1 : a.firstSeenAt > b.firstSeenAt ? 1 : 0;
}

export function issuePrompt(issue: Pick<Issue, "title" | "body" | "report" | "kind">): string {
  const ask =
    issue.kind === "connect"
      ? "Help me connect this report in AmICited. Explain the steps and do what you can for me."
      : "Fix this issue on my website. Check the current state first, make the changes, and tell me what to review.";
  return [
    ask,
    "",
    `Issue: ${issue.title}`,
    `Found in: ${issue.report}`,
    "",
    issue.body,
    "",
    "When it is fixed, call issue_set_status with status done.",
  ].join("\n");
}

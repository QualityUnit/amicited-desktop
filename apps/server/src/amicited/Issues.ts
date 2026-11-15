import {
  Issue,
  type IssueAudit,
  IssueFailure,
  type IssueEffort,
  type IssueKind,
  type IssuePriority,
  type IssueResolution,
  type IssueStatus,
  type IssuesSnapshot,
} from "@amicited/cloud-client/issues";
import {
  ProjectId,
  ScheduledTaskId,
  type ModelSelection,
  type ScheduledTask,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Context from "effect/Context";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import type * as SqlError from "effect/sql/SqlError";

import * as ProjectService from "../project/ProjectService.ts";
import * as ScheduledTasks from "../scheduledTasks/ScheduledTaskService.ts";
import * as ServerSettings from "../serverSettings.ts";
import { AmicitedCloud } from "./Cloud.ts";

export interface IssueUpsert {
  readonly fingerprint: string;
  readonly kind: IssueKind;
  readonly title: string;
  readonly body: string;
  readonly report: string;
  readonly priority: IssuePriority;
  readonly effort?: IssueEffort | null | undefined;
}

export interface IssueUpdate {
  readonly id: string;
  readonly status?: IssueStatus | undefined;
  readonly resolution?: IssueResolution | undefined;
  readonly threadId?: string | null | undefined;
}

export interface AuditConfig {
  readonly projectId: string;
  readonly enabled: boolean;
  readonly timeOfDay?: string | undefined;
  readonly instructions?: string | undefined;
}

export class AmicitedIssues extends Context.Service<
  AmicitedIssues,
  {
    readonly snapshot: () => Effect.Effect<IssuesSnapshot, IssueFailure>;
    readonly subscribe: () => Stream.Stream<IssuesSnapshot, IssueFailure>;
    readonly list: (
      projectId: string,
      status: IssueStatus | "all",
    ) => Effect.Effect<ReadonlyArray<Issue>, IssueFailure>;
    readonly forThread: (threadId: string) => Effect.Effect<Issue | null, IssueFailure>;
    readonly upsert: (projectId: string, input: IssueUpsert) => Effect.Effect<Issue, IssueFailure>;
    readonly update: (input: IssueUpdate) => Effect.Effect<Issue, IssueFailure>;
    readonly configureAudit: (input: AuditConfig) => Effect.Effect<IssueAudit, IssueFailure>;
    readonly runAudit: (projectId: string) => Effect.Effect<IssueAudit, IssueFailure>;
    /** Turns the daily audit on when a domain connects and off when it disconnects. */
    readonly setConnected: (
      projectId: string,
      connected: boolean,
    ) => Effect.Effect<void, IssueFailure>;
    readonly forgetProject: (projectId: string) => Effect.Effect<void, IssueFailure>;
  }
>()("t3/amicited/Issues/AmicitedIssues") {}

const DEFAULT_AUDIT_TIME = "06:00";

// AmICited tables keep their own migration list so upstream migration ids never collide with ours.
const migrations: ReadonlyArray<
  readonly [number, string, (sql: SqlClient.SqlClient) => Effect.Effect<unknown, SqlError.SqlError>]
> = [
  [
    1,
    "Issues",
    (sql) =>
      Effect.all([
        sql`
          CREATE TABLE IF NOT EXISTS amicited_issues (
            issue_id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            report TEXT NOT NULL,
            priority TEXT NOT NULL,
            effort TEXT,
            status TEXT NOT NULL,
            resolution TEXT,
            thread_id TEXT,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            resolved_at TEXT,
            updated_at TEXT NOT NULL,
            UNIQUE (project_id, fingerprint)
          )
        `,
        sql`CREATE INDEX IF NOT EXISTS amicited_issues_thread ON amicited_issues (thread_id)`,
        sql`
          CREATE TABLE IF NOT EXISTS amicited_issue_audits (
            project_id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            instructions TEXT NOT NULL DEFAULT ''
          )
        `,
      ]),
  ],
];

interface IssueRow {
  readonly issue_id: string;
  readonly project_id: string;
  readonly fingerprint: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly report: string;
  readonly priority: string;
  readonly effort: string | null;
  readonly status: string;
  readonly resolution: string | null;
  readonly thread_id: string | null;
  readonly first_seen_at: string;
  readonly last_seen_at: string;
  readonly resolved_at: string | null;
  readonly updated_at: string;
}

interface AuditRow {
  readonly project_id: string;
  readonly task_id: string;
  readonly instructions: string;
}

const decodeIssue = Schema.decodeUnknownEffect(Issue);
const toIssue = (row: IssueRow) =>
  decodeIssue({
    id: row.issue_id,
    projectId: row.project_id,
    fingerprint: row.fingerprint,
    kind: row.kind,
    title: row.title,
    body: row.body,
    report: row.report,
    priority: row.priority,
    effort: row.effort,
    status: row.status,
    resolution: row.resolution,
    threadId: row.thread_id,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    resolvedAt: row.resolved_at,
    updatedAt: row.updated_at,
  });

const fail = (message: string) => () => new IssueFailure({ message });

function auditPrompt(hostname: string, instructions: string): string {
  const lines = [
    `Daily AmICited audit for ${hostname}.`,
    "",
    "Keep this domain's Issues list complete, current and ranked so the user can fix problems one by one.",
    "",
    "1. Call issues_list with status all to see what is already tracked.",
    "2. Call amicited_cloud_discover with list_toolsets, then go through EVERY AmICited report for this domain. Do not stop early.",
    "3. For a report that is not connected or not set up (for example Search Console, Analytics or prompt tracking), call issue_upsert with kind connect and priority high, saying what connecting unlocks.",
    "4. For a connected report, read it with read-only amicited_cloud_call tools. For each real problem call issue_upsert with kind fix: a concrete title, a body with the evidence (URLs, numbers) and the steps to fix it, the report name, priority and effort.",
    "5. Give each problem a stable fingerprint such as report:check:scope, so a problem seen again updates its issue instead of adding one.",
    "6. For an open issue from a report you read that no longer shows the problem, call issue_set_status with status done and resolution audit. Dismissed issues stay dismissed.",
    "7. Do not edit files, publish, or change anything in AmICited. End with a short summary: reports checked, new issues, fixed issues.",
  ];
  const extra = instructions.trim();
  return extra ? [...lines, "", "Instructions from the user:", extra].join("\n") : lines.join("\n");
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const random = yield* SecureRandom.SecureRandom;
  const scheduled = yield* ScheduledTasks.ScheduledTaskService;
  const projects = yield* ProjectService.ProjectService;
  const settings = yield* ServerSettings.ServerSettingsService;
  const cloud = yield* AmicitedCloud;
  const changes = yield* PubSub.sliding<void>(1);
  const notify = PubSub.publish(changes, undefined);

  yield* sql`
    CREATE TABLE IF NOT EXISTS amicited_migrations (
      migration_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `;
  const applied = new Set(
    (yield* sql<{ migration_id: number }>`SELECT migration_id FROM amicited_migrations`).map(
      (row) => row.migration_id,
    ),
  );
  for (const [id, name, run] of migrations) {
    if (applied.has(id)) continue;
    const at = DateTime.formatIso(yield* DateTime.now);
    yield* sql.withTransaction(
      run(sql).pipe(
        Effect.andThen(
          sql`INSERT INTO amicited_migrations (migration_id, name, applied_at) VALUES (${id}, ${name}, ${at})`,
        ),
      ),
    );
  }

  const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

  const issueRows = (where: Effect.Effect<ReadonlyArray<IssueRow>, SqlError.SqlError>) =>
    where.pipe(
      NodeSqliteClient.readOnly,
      Effect.flatMap(Effect.forEach(toIssue)),
      Effect.mapError(fail("Could not read issues.")),
    );

  const findIssue = (id: string) =>
    issueRows(sql<IssueRow>`SELECT * FROM amicited_issues WHERE issue_id = ${id}`).pipe(
      Effect.flatMap(([issue]) =>
        issue
          ? Effect.succeed(issue)
          : Effect.fail(new IssueFailure({ message: "Issue not found." })),
      ),
    );

  const auditRows = sql<AuditRow>`SELECT * FROM amicited_issue_audits`.pipe(
    NodeSqliteClient.readOnly,
    Effect.mapError(fail("Could not read audits.")),
  );

  const toAudit = (row: AuditRow, task: ScheduledTask | undefined): IssueAudit => ({
    projectId: row.project_id,
    taskId: row.task_id,
    enabled: task?.enabled ?? false,
    timeOfDay: task?.schedule.type === "fixed_time" ? task.schedule.timeOfDay : DEFAULT_AUDIT_TIME,
    instructions: row.instructions,
    threadId: task?.threadId ?? null,
    nextRunAt: task?.nextRunAt ?? null,
    lastRunAt: task?.lastRunAt ?? null,
    lastRunStatus: task?.lastRunStatus ?? "never",
    lastRunError: task?.lastRunError ?? null,
  });

  const tasks = scheduled.list().pipe(
    Effect.map((result) => new Map(result.tasks.map((task) => [task.id as string, task]))),
    Effect.mapError((error) => new IssueFailure({ message: error.message })),
  );

  const snapshot = Effect.fn("AmicitedIssues.snapshot")(function* () {
    const issues = yield* issueRows(
      sql<IssueRow>`SELECT * FROM amicited_issues ORDER BY first_seen_at`,
    );
    const audits = yield* auditRows;
    const byId = yield* tasks;
    return { issues, audits: audits.map((row) => toAudit(row, byId.get(row.task_id))) };
  });

  const subscribe = () =>
    Stream.unwrap(
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(changes);
        // The task list emits once on subscribe, which sends the first snapshot.
        const taskChanges = scheduled.subscribeList().pipe(
          Stream.map(() => undefined),
          Stream.mapError((error) => new IssueFailure({ message: error.message })),
        );
        return Stream.merge(taskChanges, Stream.fromSubscription(subscription)).pipe(
          Stream.mapEffect(() => snapshot()),
        );
      }),
    );

  const list = Effect.fn("AmicitedIssues.list")(function* (
    projectId: string,
    status: IssueStatus | "all",
  ) {
    return yield* status === "all"
      ? issueRows(sql<IssueRow>`SELECT * FROM amicited_issues WHERE project_id = ${projectId}`)
      : issueRows(
          sql<IssueRow>`SELECT * FROM amicited_issues WHERE project_id = ${projectId} AND status = ${status}`,
        );
  });

  const forThread = Effect.fn("AmicitedIssues.forThread")(function* (threadId: string) {
    const [issue] = yield* issueRows(
      sql<IssueRow>`SELECT * FROM amicited_issues WHERE thread_id = ${threadId} LIMIT 1`,
    );
    return issue ?? null;
  });

  const upsert = Effect.fn("AmicitedIssues.upsert")(function* (
    projectId: string,
    input: IssueUpsert,
  ) {
    const now = yield* nowIso;
    const [existing] = yield* issueRows(
      sql<IssueRow>`SELECT * FROM amicited_issues WHERE project_id = ${projectId} AND fingerprint = ${input.fingerprint}`,
    );
    const effort = input.effort ?? null;
    let id: string;
    if (existing === undefined) {
      id = `issue:${yield* random.uuidV4().pipe(Effect.mapError(fail("Could not create the issue.")))}`;
      yield* sql`
        INSERT INTO amicited_issues (
          issue_id, project_id, fingerprint, kind, title, body, report, priority, effort,
          status, resolution, thread_id, first_seen_at, last_seen_at, resolved_at, updated_at
        ) VALUES (
          ${id}, ${projectId}, ${input.fingerprint}, ${input.kind}, ${input.title}, ${input.body},
          ${input.report}, ${input.priority}, ${effort}, 'open', NULL, NULL, ${now}, ${now}, NULL, ${now}
        )
      `.pipe(Effect.mapError(fail("Could not save the issue.")));
    } else {
      id = existing.id;
      // A problem seen again is not fixed, but a dismissal is the user's call.
      const reopen = existing.status === "done";
      yield* sql`
        UPDATE amicited_issues
        SET kind = ${input.kind}, title = ${input.title}, body = ${input.body},
            report = ${input.report}, priority = ${input.priority}, effort = ${effort},
            last_seen_at = ${now}, updated_at = ${now},
            status = ${reopen ? "open" : existing.status},
            resolution = ${reopen ? null : existing.resolution},
            resolved_at = ${reopen ? null : existing.resolvedAt}
        WHERE issue_id = ${id}
      `.pipe(Effect.mapError(fail("Could not save the issue.")));
    }
    yield* notify;
    return yield* findIssue(id);
  });

  const update = Effect.fn("AmicitedIssues.update")(function* (input: IssueUpdate) {
    const issue = yield* findIssue(input.id);
    const now = yield* nowIso;
    const status = input.status ?? issue.status;
    const closing = status !== "open";
    const statusChanged = status !== issue.status;
    const resolution: IssueResolution | null =
      status === "open"
        ? null
        : status === "dismissed"
          ? "user"
          : (input.resolution ?? (statusChanged ? "user" : issue.resolution));
    const resolvedAt = !closing ? null : statusChanged ? now : issue.resolvedAt;
    const threadId = input.threadId === undefined ? issue.threadId : input.threadId;
    yield* sql`
      UPDATE amicited_issues
      SET status = ${status}, resolution = ${resolution}, resolved_at = ${resolvedAt},
          thread_id = ${threadId}, updated_at = ${now}
      WHERE issue_id = ${issue.id}
    `.pipe(Effect.mapError(fail("Could not update the issue.")));
    yield* notify;
    return yield* findIssue(issue.id);
  });

  const auditRow = (projectId: string) =>
    sql<AuditRow>`SELECT * FROM amicited_issue_audits WHERE project_id = ${projectId}`.pipe(
      Effect.map(([row]) => row),
      Effect.mapError(fail("Could not read the audit.")),
    );

  const resolveModel = Effect.fn("AmicitedIssues.resolveModel")(function* (projectId: string) {
    const project = yield* projects
      .getById(ProjectId.make(projectId))
      .pipe(Effect.mapError(fail("This domain no longer exists.")));
    if (Option.isNone(project))
      return yield* new IssueFailure({ message: "This domain no longer exists." });
    const current = yield* settings.getSettings.pipe(
      Effect.mapError(fail("Could not read settings.")),
    );
    const selection: ModelSelection =
      project.value.defaultModelSelection ??
      current.defaultModelSelection ??
      current.textGenerationModelSelection;
    return selection;
  });

  const hostname = (projectId: string) =>
    Effect.promise(async () => (await cloud.domains?.metadata()) ?? []).pipe(
      Effect.map(
        (domains) =>
          domains.find((domain) => domain.projectId === projectId)?.hostname ?? "this domain",
      ),
    );

  const configureAudit = Effect.fn("AmicitedIssues.configureAudit")(function* (input: AuditConfig) {
    const existing = yield* auditRow(input.projectId);
    const byId = yield* tasks;
    const task = existing ? byId.get(existing.task_id) : undefined;
    const instructions = input.instructions ?? existing?.instructions ?? "";
    const timeOfDay =
      input.timeOfDay ??
      (task?.schedule.type === "fixed_time" ? task.schedule.timeOfDay : DEFAULT_AUDIT_TIME);
    const host = yield* hostname(input.projectId);
    const result = yield* scheduled
      .upsert({
        ...(task ? { id: task.id } : {}),
        title: `Daily audit · ${host}`,
        prompt: auditPrompt(host, instructions),
        enabled: input.enabled,
        schedule: { type: "fixed_time", timeOfDay, catchUp: true },
        projectId: ProjectId.make(input.projectId),
        threadMode: "fresh_session",
        workspaceStrategy: { type: "root" },
        modelSelection: task?.modelSelection ?? (yield* resolveModel(input.projectId)),
        runtimeMode: "approval-required",
        interactionMode: "default",
      })
      .pipe(Effect.mapError((error) => new IssueFailure({ message: error.message })));
    yield* sql`
      INSERT INTO amicited_issue_audits (project_id, task_id, instructions)
      VALUES (${input.projectId}, ${result.task.id}, ${instructions})
      ON CONFLICT (project_id) DO UPDATE SET task_id = excluded.task_id, instructions = excluded.instructions
    `.pipe(Effect.mapError(fail("Could not save the audit.")));
    yield* notify;
    // The first audit runs right away so a new connection is not an empty list until tomorrow.
    if (task === undefined && input.enabled)
      yield* scheduled.runNow({ id: result.task.id }).pipe(Effect.ignoreCause({ log: true }));
    return toAudit(
      { project_id: input.projectId, task_id: result.task.id, instructions },
      (yield* tasks).get(result.task.id) ?? result.task,
    );
  });

  const runAudit = Effect.fn("AmicitedIssues.runAudit")(function* (projectId: string) {
    const row = yield* auditRow(projectId);
    if (!row) return yield* configureAudit({ projectId, enabled: true });
    yield* scheduled
      .runNow({ id: ScheduledTaskId.make(row.task_id) })
      .pipe(Effect.mapError((error) => new IssueFailure({ message: error.message })));
    return toAudit(row, (yield* tasks).get(row.task_id));
  });

  const setConnected = Effect.fn("AmicitedIssues.setConnected")(function* (
    projectId: string,
    connected: boolean,
  ) {
    const row = yield* auditRow(projectId);
    if (!row && !connected) return;
    const task = row ? (yield* tasks).get(row.task_id) : undefined;
    if (task?.enabled === connected) return;
    yield* configureAudit({ projectId, enabled: connected });
  });

  const forgetProject = Effect.fn("AmicitedIssues.forgetProject")(function* (projectId: string) {
    const row = yield* auditRow(projectId);
    if (row)
      yield* scheduled
        .delete({ id: ScheduledTaskId.make(row.task_id) })
        .pipe(Effect.ignoreCause({ log: true }));
    yield* sql
      .withTransaction(
        Effect.all([
          sql`DELETE FROM amicited_issue_audits WHERE project_id = ${projectId}`,
          sql`DELETE FROM amicited_issues WHERE project_id = ${projectId}`,
        ]),
      )
      .pipe(Effect.mapError(fail("Could not remove this domain's issues.")));
    yield* notify;
  });

  return AmicitedIssues.of({
    snapshot,
    subscribe,
    list,
    forThread,
    upsert,
    update,
    configureAudit,
    runAudit,
    setConnected,
    forgetProject,
  });
});

export const layer = Layer.effect(AmicitedIssues, make);

import { CloudClient } from "@amicited/cloud-client";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it } from "@effect/vitest";
import {
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ScheduledTaskId,
  type ScheduledTask,
  type ScheduledTaskUpsertInput,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { ProjectService } from "../project/ProjectService.ts";
import { ProviderInstanceRegistry } from "../provider/ProviderInstanceRegistry.ts";
import { ScheduledTaskService } from "../scheduledTasks/ScheduledTaskService.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { AmicitedCloud } from "./Cloud.ts";
import * as Issues from "./Issues.ts";

const layer = Issues.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      SqlitePersistence.layerMemory,
      NodeCrypto.layer,
      Layer.mock(ScheduledTaskService)({ list: () => Effect.succeed({ tasks: [] }) }),
      Layer.mock(ProjectService)({}),
      Layer.mock(ServerSettingsService)({}),
      Layer.mock(ProviderInstanceRegistry)({}),
      Layer.succeed(
        AmicitedCloud,
        new CloudClient({
          secrets: { read: async () => undefined, write: async () => {}, clear: async () => {} },
          openExternal: async () => {},
        }),
      ),
    ),
  ),
);

const problem = {
  fingerprint: "website-audit:meta-description:site",
  kind: "fix",
  title: "12 pages are missing a meta description",
  body: "/pricing and 11 more",
  report: "Website audit",
  priority: "high",
} as const;

it.effect(
  "an audit updates a known problem and only reopens it when the user closed it as done",
  () =>
    Effect.gen(function* () {
      const issues = yield* Issues.AmicitedIssues;
      const first = yield* issues.upsert("domain", problem);
      const again = yield* issues.upsert("domain", {
        ...problem,
        title: "13 pages are missing a meta description",
      });
      assert.strictEqual(again.id, first.id);
      assert.strictEqual(again.title, "13 pages are missing a meta description");
      assert.lengthOf(yield* issues.list("domain", "all"), 1);

      const done = yield* issues.update({ id: first.id, status: "done" });
      assert.strictEqual(done.resolution, "user");
      assert.isNotNull(done.resolvedAt);
      const reopened = yield* issues.upsert("domain", problem);
      assert.strictEqual(reopened.status, "open");
      assert.isNull(reopened.resolution);

      yield* issues.update({ id: first.id, status: "dismissed" });
      const stillDismissed = yield* issues.upsert("domain", problem);
      assert.strictEqual(stillDismissed.status, "dismissed");

      const other = yield* issues.upsert("other-domain", problem);
      assert.notStrictEqual(other.id, first.id);
      const connection = {
        ...problem,
        fingerprint: "tracking:connection:google",
        kind: "connect" as const,
      };
      const evidence = {
        affectedPromptCount: 2,
        questions: ["Question one", "Question two"],
        destination: "/prompts?site=domain&run=check",
      };
      const google = yield* issues.upsert("domain", { ...connection, evidence });
      assert.deepEqual(
        (yield* issues.list("domain", "all")).find((i) => i.id === google.id)?.evidence,
        evidence,
      );
      assert.strictEqual((yield* issues.upsert("other-domain", connection)).id, google.id);
      yield* issues.update({ id: google.id, status: "done", resolution: "audit" });
      assert.strictEqual((yield* issues.upsert("other-domain", connection)).status, "open");
      yield* issues.update({ id: google.id, status: "dismissed" });
      assert.strictEqual((yield* issues.upsert("domain", connection)).status, "dismissed");
    }).pipe(Effect.provide(layer)),
);

it.effect("links one thread to an issue and finds the issue from that thread", () =>
  Effect.gen(function* () {
    const issues = yield* Issues.AmicitedIssues;
    const issue = yield* issues.upsert("domain", problem);
    yield* issues.update({ id: issue.id, threadId: "thread-1" });
    assert.strictEqual((yield* issues.forThread("thread-1"))?.id, issue.id);
    const closed = yield* issues.update({ id: issue.id, status: "done", resolution: "audit" });
    assert.strictEqual(closed.resolution, "audit");
    assert.strictEqual(closed.threadId, "thread-1");
  }).pipe(Effect.provide(layer)),
);

it.effect("refuses to start an audit for a domain that is not connected to AmICited", () =>
  Effect.gen(function* () {
    const issues = yield* Issues.AmicitedIssues;
    const turnedOn = yield* Effect.flip(
      issues.configureAudit({ projectId: "domain", enabled: true }),
    );
    assert.strictEqual(turnedOn.message, "Connect AmICited to this domain first.");
    const ran = yield* Effect.flip(issues.runAudit("domain"));
    assert.strictEqual(ran.message, "Connect AmICited to this domain first.");
  }).pipe(Effect.provide(layer)),
);

const ready = {
  enabled: true,
  installed: true,
  status: "ready",
  auth: { status: "authenticated" },
};
const signedOut = { ...ready, auth: { status: "unauthenticated" } };

it.effect.each([
  {
    name: "Claude is the assistant but signed out, so Codex runs it on Sol",
    claude: signedOut,
    assistant: "claude",
    expected: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-6.1-sol",
      options: [{ id: "reasoningEffort", value: "high" }],
    },
  },
  {
    name: "the assistant is neither Claude nor Codex, so Claude runs it on Opus",
    claude: ready,
    assistant: "cursor",
    expected: {
      instanceId: ProviderInstanceId.make("claude"),
      model: "claude-opus-5-5",
      options: [{ id: "effort", value: "high" }],
    },
  },
])("moves an audit saved on the background model: $name", ({ claude, assistant, expected }) => {
  const task = {
    id: ScheduledTaskId.make("task-1"),
    title: "Daily audit · example.com",
    prompt: "Audit example.com",
    enabled: true,
    schedule: { type: "fixed_time", timeOfDay: "06:00" },
    projectId: ProjectId.make("domain"),
    threadId: null,
    workspaceStrategy: { type: "root" },
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-6-luna" },
    runtimeMode: "approval-required",
    interactionMode: "default",
  } as ScheduledTask;
  const provider = (id: string, snapshot: object) => ({
    instanceId: ProviderInstanceId.make(id),
    driverKind: ProviderDriverKind.make(id === "claude" ? "claudeAgent" : id),
    enabled: true,
    snapshot: { getSnapshot: Effect.succeed(snapshot) },
  });
  const oldAudit = Layer.effectDiscard(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE amicited_migrations (migration_id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`;
      yield* sql`INSERT INTO amicited_migrations VALUES (1, 'Issues', '2026-11-01T00:00:00Z')`;
      yield* sql`CREATE TABLE amicited_issues (issue_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, fingerprint TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, report TEXT NOT NULL, priority TEXT NOT NULL, effort TEXT, status TEXT NOT NULL, resolution TEXT, thread_id TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, resolved_at TEXT, updated_at TEXT NOT NULL, UNIQUE (project_id, fingerprint))`;
      yield* sql`CREATE TABLE amicited_issue_audits (project_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '')`;
      yield* sql`INSERT INTO amicited_issue_audits VALUES ('domain', 'task-1', '')`;
    }),
  ).pipe(Layer.provideMerge(SqlitePersistence.layerMemory));
  return Effect.gen(function* () {
    const saved = yield* Deferred.make<ScheduledTaskUpsertInput>();
    const deps = Layer.mergeAll(
      oldAudit,
      NodeCrypto.layer,
      Layer.mock(ScheduledTaskService)({
        list: () => Effect.succeed({ tasks: [task] }),
        upsert: (input) => Deferred.succeed(saved, input).pipe(Effect.as({ task, created: false })),
      }),
      Layer.mock(ProjectService)({
        getById: () => Effect.succeedSome({ defaultModelSelection: undefined } as never),
      }),
      Layer.mock(ServerSettingsService)({
        getSettings: Effect.succeed({
          textGenerationModelSelection: { instanceId: assistant, model: "default" },
        } as never),
      }),
      Layer.mock(ProviderInstanceRegistry)({
        listInstances: Effect.succeed([
          provider("claude", claude),
          provider("codex", ready),
          provider("cursor", ready),
        ] as never),
      }),
      Layer.succeed(AmicitedCloud, {} as never),
    );
    const moved = yield* Deferred.await(saved).pipe(
      Effect.provide(Issues.layer.pipe(Layer.provideMerge(deps))),
    );
    assert.deepStrictEqual(moved.modelSelection, expected);
  });
});

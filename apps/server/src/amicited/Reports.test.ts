import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as TestClock from "effect/testing/TestClock";
import {
  EventId,
  RunId,
  ProviderInstanceId,
  MessageId,
  type OrchestrationV2DomainEvent,
} from "@t3tools/contracts";
import { commentaryData } from "./ReportsEditing.ts";
import * as ReportsEditing from "./ReportsEditing.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import { ProjectId, ThreadId, EnvironmentId } from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import * as Invocation from "../mcp/McpInvocationContext.ts";
import * as Access from "../mcp/McpToolAccess.ts";
import * as Testkit from "../mcp/McpToolAccess.testkit.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ThreadLaunch from "../orchestration-v2/ThreadLaunchService.ts";
import * as Preview from "../preview/Manager.ts";
import * as Settings from "../serverSettings.ts";
import * as ReportsPreview from "./ReportsPreview.ts";
import * as ReportsHandlers from "./ReportsToolkit.ts";
import { ReportsToolkit } from "./ReportsToolkit.ts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { ReportFailure } from "@amicited/reports/rpc";
import * as Reports from "./Reports.ts";
import * as ReportsApi from "./ReportsApi.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const api = Layer.succeed(ReportsApi.ReportsApi, {
  branding: () => Effect.succeed({ domain: "example.com" }),
  connection: () =>
    Effect.succeed({ domain: "example.com", workspaceId: "workspace", domainId: "domain" }),
  fetcher: () =>
    Effect.succeed(async (path) => {
      if (path.includes("unavailable"))
        throw new ReportFailure({ message: "Report data is unavailable." });
      return [{ value: 42 }];
    }),
  get: (_project, path) =>
    path.includes("unavailable")
      ? Effect.fail(new ReportFailure({ message: "Unavailable" }))
      : Effect.succeed([{ value: 42 }]),
  catalog: () => Effect.succeed([]),
});
const database = NodeSqliteClient.layer({ filename: ":memory:" });
const live = Reports.layer.pipe(Layer.provide(api), Layer.provide(NodeCrypto.layer));
describe("Reports", () => {
  it.effect("owns an independent idempotent migration track and cascades domain deletion", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE amicited_migrations (version INTEGER PRIMARY KEY)`;
      yield* sql`INSERT INTO amicited_migrations VALUES (99)`;
      yield* Reports.migrate();
      yield* Reports.migrate();
      assert.deepEqual(yield* sql`SELECT version FROM amicited_migrations`, [{ version: 99 }]);
      assert.deepEqual(yield* sql`SELECT version FROM amicited_reports_migrations`, [
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
      ]);
      yield* Effect.gen(function* () {
        const reports = yield* Reports.Reports;
        const report = yield* reports.create({ projectId: "project", title: "Visibility" });
        const saved = yield* reports.run(report.id);
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN period_label`;
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN comparison_label`;
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN error_count`;
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN narrative_requested`;
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN narrative_block_ids_json`;
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN narrative_completed_ids_json`;
        yield* sql`DELETE FROM amicited_reports_migrations WHERE version=3`;
        yield* Reports.migrate();
        assert.deepEqual((yield* reports.snapshotSummary(saved.id)).period, saved.period);
        yield* sql`UPDATE amicited_reports SET payload_json='broken' WHERE project_id='project'`;
        yield* sql`UPDATE amicited_report_snapshots SET payload_json='broken' WHERE report_id=${report.id}`;
        assert.equal((yield* reports.list("project")).length, 1);
        assert.equal((yield* reports.snapshotSummary(saved.id)).status, "ready");
        yield* reports.deleteProject("project");
        assert.deepEqual(yield* reports.list(undefined, true), []);
        assert.deepEqual(yield* sql`SELECT snapshot_id FROM amicited_report_snapshots`, []);
      }).pipe(Effect.provide(live));
    }).pipe(Effect.provide(database)),
  );
  it.effect("archives, restores, duplicates and prevents cross-project reads and writes", () =>
    Effect.gen(function* () {
      const reports = yield* Reports.Reports;
      const original = yield* reports.create({ projectId: "a", title: "Report" });
      const archived = yield* reports.update({ id: original.id, archivedAt: "2026-11-01" });
      assert.equal(archived.specRevision, 1);
      assert.equal(
        (yield* reports.update({ id: original.id, spec: original.spec })).specRevision,
        1,
      );
      const renamed = yield* reports.update({
        id: original.id,
        spec: { ...original.spec, title: "Renamed" },
      });
      assert.equal(renamed.title, "Renamed");
      assert.equal(renamed.specRevision, 2);
      assert.equal((yield* reports.list("a")).length, 0);
      yield* reports.update({ id: original.id, archivedAt: null });
      assert.equal((yield* reports.list("a")).length, 1);
      assert.equal(yield* Effect.isFailure(reports.get(original.id, "b")), true);
      assert.equal(
        yield* Effect.isFailure(reports.update({ id: original.id, title: "stolen" }, "b")),
        true,
      );
      assert.equal(yield* Effect.isFailure(reports.remove(original.id, "b")), true);
      const copy = yield* reports.duplicate(original.id, "b");
      assert.equal(copy.projectId, "b");
      assert.equal(copy.threadId, null);
      assert.deepEqual(copy.spec, renamed.spec);
      yield* reports.remove(copy.id);
      assert.equal(yield* Effect.isFailure(reports.get(copy.id)), true);
    }).pipe(Effect.provide(live.pipe(Layer.provideMerge(database)))),
  );
  it.effect(
    "freezes a partial snapshot with scoped datasets and persists commentary only from its assigned thread",
    () =>
      Effect.gen(function* () {
        const reports = yield* Reports.Reports;
        const r = yield* reports.create({ projectId: "a", title: "Report" });
        yield* reports.update({
          id: r.id,
          spec: {
            ...r.spec,
            queries: {
              good: { path: "/v2/amicited/good" },
              bad: { path: "/v2/amicited/unavailable" },
            },
            pages: [{ blocks: [{ type: "narrative", id: "summary", prompt: "Summarize" }] }],
          },
        });
        const s = yield* reports.run(r.id);
        assert.equal(s.status, "partial");
        const summary = yield* reports.snapshotSummary(s.id);
        assert.equal(summary.errorCount, 1);
        assert.equal(summary.narrative, "writing");
        assert.equal("datasets" in summary, false);
        assert.deepEqual((yield* reports.list("a"))[0]?.lastSnapshot, summary);
        yield* TestClock.adjust("119 seconds");
        assert.equal((yield* reports.snapshotSummary(s.id)).narrative, "writing");
        yield* TestClock.adjust("1 second");
        assert.equal((yield* reports.snapshotSummary(s.id)).narrative, "failed");

        assert.deepEqual(s.datasets.good, [{ value: 42 }]);
        assert.equal(s.errors.bad, "Report data is unavailable.");
        assert.equal(yield* Effect.isFailure(reports.snapshot(s.id, "b")), true);
        yield* reports.attachNarrativeThread(s.id, "narrator");
        assert.equal(
          yield* Effect.isFailure(
            reports.narrativeSubmit(s.id, "summary", "Text", "b", "narrator"),
          ),
          true,
        );
        assert.equal(
          yield* Effect.isFailure(reports.narrativeSubmit(s.id, "summary", "Text", "a", "other")),
          true,
        );
        yield* reports.narrativeSubmit(s.id, "summary", "Text", "a", "narrator");
        assert.deepEqual((yield* reports.snapshot(s.id)).narrative, { summary: "Text" });
        yield* reports.update({ id: r.id, narrativeEnabled: false });
        const off = yield* reports.run(r.id);
        yield* reports.update({ id: r.id, narrativeEnabled: true });
        assert.equal((yield* reports.snapshotSummary(off.id)).narrative, "off");
        const html = yield* reports.html(off.id, "snapshot");
        assert.equal(html.includes("Commentary is not available"), false);
        yield* reports.deleteSnapshot(off.id);
        yield* reports.deleteSnapshot(s.id);
        assert.deepEqual(yield* reports.snapshotSummaries(r.id), []);
      }).pipe(Effect.provide(live.pipe(Layer.provideMerge(database)))),
  );
});

it.effect("MCP tools cannot read, save or run another domain's report", () => {
  const threadId = ThreadId.make("reports-caller");
  const thread = { ...Testkit.liveThreadShell(threadId), projectId: ProjectId.make("a") };
  const dependencies = ReportsEditing.layer.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        live,
        api,
        Layer.mock(Orchestrator.OrchestratorV2)({ streamDomainEvents: Stream.empty }),
        Layer.mock(ThreadLaunch.ThreadLaunchService)({}),
        Layer.mock(Preview.PreviewManager)({}),
        Layer.mock(Settings.ServerSettingsService)({}),
        Layer.mock(ReportsPreview.ReportsPreview)({}),
        Layer.mock(ThreadManagement.ThreadManagementService)({
          getThreadShell: () => Effect.succeed(thread),
        }),
        Layer.succeed(Invocation.McpInvocationContext, {
          environmentId: EnvironmentId.make("reports-test"),
          requestNamespace: "test",
          client: undefined,
          thread: {
            threadId,
            providerInstanceId: thread.providerInstanceId!,
            providerSessionId: "session",
          },
          issuedAt: 0,
          capabilities: new Set(["orchestration" as const]),
        }),
      ),
    ),
    Layer.provideMerge(database),
    Layer.provideMerge(NodeCrypto.layer),
  );
  return Effect.gen(function* () {
    const reports = yield* Reports.Reports;
    const other = yield* reports.create({ projectId: "b", title: "Private report" });
    const own = yield* reports.create({ projectId: "a", title: "Own report" });
    const toolkit = yield* ReportsToolkit.pipe(
      Effect.provide(
        Access.HandlersLayer.layer(ReportsHandlers.layer).pipe(Layer.provide(dependencies)),
      ),
    );
    const ownRead = yield* toolkit
      .handle("report_get", { id: own.id })
      .pipe(Stream.unwrap, Stream.runCollect);
    assert.equal(encodeJson(ownRead.at(-1)?.result).includes("previewUrl"), false);
    const read = yield* toolkit
      .handle("report_get", { id: other.id })
      .pipe(Stream.unwrap, Stream.runCollect);
    assert.equal(read.at(-1)?.isFailure, true);
    const save = yield* toolkit
      .handle("report_save", { id: other.id, spec: { ...other.spec, title: "Changed" } })
      .pipe(Stream.unwrap, Stream.runCollect);
    assert.equal(save.at(-1)?.isFailure, true);
    const run = yield* toolkit
      .handle("report_run", { id: other.id })
      .pipe(Stream.unwrap, Stream.runCollect);
    assert.equal(run.at(-1)?.isFailure, true);
    assert.equal((yield* reports.get(other.id)).title, "Private report");
    assert.deepEqual(yield* reports.snapshotSummaries(other.id), []);
  }).pipe(Effect.provide(dependencies));
});

it("limits commentary to each block's datasets and preserves valid JSON when trimming", () => {
  const text = commentaryData(
    [
      { id: "a", prompt: "Summarize", data: ["large"] },
      { id: "b", prompt: "Everything" },
    ],
    {
      large: Array.from({ length: 30 }, () => ({ value: "x".repeat(300) })),
      secretOther: { visible: true },
    },
    {},
  );
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed[0].datasets), ["large"]);
  assert.equal(parsed[0].datasets.large.trimmed, true);
  assert.equal(parsed[1].datasets.secretOther.value.visible, true);
});

it.effect.each(["completed", "failed"] as const)(
  "publishes a snapshot refresh when commentary finishes as %s",
  (status) => {
    let active = true;
    const narrator = ThreadId.make("narrator");
    const runId = RunId.make("commentary-run");
    const instanceId = ProviderInstanceId.make("test-provider");
    const now = DateTime.makeUnsafe("2026-11-15T00:00:00Z");
    const event: OrchestrationV2DomainEvent = {
      id: EventId.make("commentary-terminal"),
      type: "run.updated",
      threadId: narrator,
      runId,
      occurredAt: now,
      payload: {
        id: runId,
        threadId: narrator,
        ordinal: 1,
        providerInstanceId: instanceId,
        modelSelection: { instanceId, model: "test" },
        providerThreadId: null,
        userMessageId: MessageId.make("commentary-request"),
        rootNodeId: null,
        activeAttemptId: null,
        status,
        requestedAt: now,
        startedAt: now,
        completedAt: now,
        checkpointId: null,
        contextHandoffId: null,
      },
    };
    const threadLayer = Layer.mock(ThreadManagement.ThreadManagementService)({
      getThreadShell: () =>
        Effect.succeed(Testkit.liveThreadShell(narrator, { activeRunId: active ? runId : null })),
    });
    const services = live.pipe(
      Layer.provideMerge(database),
      Layer.provideMerge(threadLayer),
      Layer.provideMerge(NodeCrypto.layer),
    );
    return Effect.gen(function* () {
      const reports = yield* Reports.Reports;
      const report = yield* reports.create({ projectId: "a", title: "Report" });
      yield* reports.update({
        id: report.id,
        spec: {
          ...report.spec,
          pages: [{ blocks: [{ type: "narrative", id: "summary", prompt: "Summarize" }] }],
        },
      });
      const snapshot = yield* reports.run(report.id);
      yield* reports.attachNarrativeThread(snapshot.id, narrator);
      assert.equal((yield* reports.snapshotSummary(snapshot.id)).narrative, "writing");
      const pull = yield* Stream.toPull(reports.changes);
      yield* Effect.gen(function* () {
        yield* ReportsEditing.ReportsEditing;
        const batch = yield* pull;
        assert.equal(batch[0]?.reportId, report.id);
        assert.equal((yield* reports.snapshotSummary(snapshot.id)).narrative, "failed");
      }).pipe(
        Effect.provide(
          ReportsEditing.layer.pipe(
            Layer.provide(
              Layer.mergeAll(
                Layer.mock(ReportsPreview.ReportsPreview)({}),
                Layer.mock(ThreadLaunch.ThreadLaunchService)({}),
                Layer.mock(Settings.ServerSettingsService)({}),
                Layer.mock(Preview.PreviewManager)({}),
                Layer.mock(Orchestrator.OrchestratorV2)({
                  streamDomainEvents: Stream.fromEffect(
                    Effect.sync(() => {
                      active = false;
                      return event;
                    }),
                  ),
                }),
              ),
            ),
          ),
        ),
      );
    }).pipe(Effect.provide(services));
  },
);

it.effect("renders snapshots from frozen branding after the domain changes", () => {
  let hostname = "before.example";
  let brandingCalls = 0;
  const source = Layer.succeed(ReportsApi.ReportsApi, {
    ...ReportsApi.ReportsApi.of({
      connection: () =>
        Effect.succeed({ domain: hostname, workspaceId: "workspace", domainId: "domain" }),
      fetcher: () => Effect.succeed(async () => []),
      get: () => Effect.succeed([]),
      catalog: () => Effect.succeed([]),
      branding: () =>
        Effect.sync(() => {
          brandingCalls++;
          return { domain: hostname };
        }),
    }),
  });
  return Effect.gen(function* () {
    const reports = yield* Reports.Reports;
    const report = yield* reports.create({ projectId: "a", title: "{{ $domain }}" });
    const snapshot = yield* reports.run(report.id);
    const before = yield* reports.html(snapshot.id, "snapshot");
    hostname = "after.example";
    const after = yield* reports.html(snapshot.id, "snapshot");
    assert.equal(after, before);
    assert.equal(after.includes("before.example"), true);
    assert.equal(after.includes("after.example"), false);
    assert.equal(brandingCalls, 1);
  }).pipe(
    Effect.provide(
      Reports.layer.pipe(
        Layer.provide(source),
        Layer.provide(database),
        Layer.provide(NodeCrypto.layer),
      ),
    ),
  );
});

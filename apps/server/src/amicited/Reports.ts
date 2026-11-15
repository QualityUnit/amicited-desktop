import { ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as DateTime from "effect/DateTime";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as SecureRandom from "effect/crypto/SecureRandom";
import {
  Report,
  ReportSnapshot,
  ReportFailure,
  ReportChange,
  type ReportSummary,
  type ReportSnapshotSummary,
} from "@amicited/reports/rpc";
import { decodeReportSpec, type ReportSpec } from "@amicited/reports/spec";
import { templates } from "@amicited/reports/templates";
import { resolvePeriod } from "@amicited/reports/period";
import { resolveQueries, runQueries } from "@amicited/reports/query";
import { renderReportHtml } from "@amicited/reports/render";
import { renderReportPptx } from "@amicited/reports/pptx";
import { expressionError, type ExpressionContext } from "@amicited/reports/expressions";
import * as ReportsApi from "./ReportsApi.ts";

const isReportFailure = Schema.is(ReportFailure);

const periodSchema = Schema.Struct({
  start: Schema.String,
  end: Schema.String,
  label: Schema.String,
});
const decodeRenderContext = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      context: Schema.Struct({
        domain: Schema.String,
        period: periodSchema,
        comparison: Schema.NullOr(periodSchema),
        report: Schema.Struct({ title: Schema.String }),
      }),
      logoDataUrl: Schema.optionalKey(Schema.String),
    }),
  ),
);
const decodeIds = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.String)));
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const failure = (cause?: unknown) =>
  isReportFailure(cause) ? cause : new ReportFailure({ message: "Could not access this report." });
const parseReport = Schema.decodeUnknownSync(Schema.fromJsonString(Report));
const parseSnapshot = Schema.decodeUnknownSync(Schema.fromJsonString(ReportSnapshot));
export const migrate = Effect.fn("Reports.migrate")(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`CREATE TABLE IF NOT EXISTS amicited_reports_migrations (version INTEGER PRIMARY KEY)`;
      yield* sql`CREATE TABLE IF NOT EXISTS amicited_reports (report_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, spec_json TEXT NOT NULL, spec_revision INTEGER NOT NULL, thread_id TEXT, narrative_enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT, payload_json TEXT NOT NULL)`;
      yield* sql`CREATE INDEX IF NOT EXISTS amicited_reports_project ON amicited_reports(project_id)`;
      yield* sql`CREATE TABLE IF NOT EXISTS amicited_report_snapshots (snapshot_id TEXT PRIMARY KEY, report_id TEXT NOT NULL REFERENCES amicited_reports(report_id) ON DELETE CASCADE, spec_revision INTEGER NOT NULL, spec_json TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, comparison_start TEXT, comparison_end TEXT, datasets_json TEXT NOT NULL, errors_json TEXT NOT NULL, narrative_json TEXT, narrative_thread_id TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL, render_context_json TEXT, payload_json TEXT NOT NULL)`;
      yield* sql`CREATE INDEX IF NOT EXISTS amicited_report_snapshots_report ON amicited_report_snapshots(report_id)`;
      yield* sql`INSERT OR IGNORE INTO amicited_reports_migrations(version) VALUES (1)`;
      const versions = yield* sql<{
        version: number;
      }>`SELECT version FROM amicited_reports_migrations WHERE version=2`;
      if (!versions.length) {
        yield* sql`UPDATE amicited_report_snapshots SET payload_json=json_set(payload_json, '$.narrativeRequested', json(CASE WHEN narrative_thread_id IS NOT NULL THEN 'true' ELSE 'false' END)) WHERE json_type(payload_json, '$.narrativeRequested') IS NULL`;
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN spec_json`;
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN datasets_json`;
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN errors_json`;
        yield* sql`ALTER TABLE amicited_report_snapshots DROP COLUMN narrative_json`;
        yield* sql`ALTER TABLE amicited_reports DROP COLUMN spec_json`;
        yield* sql`INSERT INTO amicited_reports_migrations(version) VALUES (2)`;
      }
      const summaryVersion = yield* sql<{
        version: number;
      }>`SELECT version FROM amicited_reports_migrations WHERE version=3`;
      if (!summaryVersion.length) {
        yield* sql`ALTER TABLE amicited_report_snapshots ADD COLUMN period_label TEXT NOT NULL DEFAULT ''`;
        yield* sql`ALTER TABLE amicited_report_snapshots ADD COLUMN comparison_label TEXT`;
        yield* sql`ALTER TABLE amicited_report_snapshots ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0`;
        yield* sql`ALTER TABLE amicited_report_snapshots ADD COLUMN narrative_requested INTEGER NOT NULL DEFAULT 0`;
        yield* sql`ALTER TABLE amicited_report_snapshots ADD COLUMN narrative_block_ids_json TEXT NOT NULL DEFAULT '[]'`;
        yield* sql`ALTER TABLE amicited_report_snapshots ADD COLUMN narrative_completed_ids_json TEXT NOT NULL DEFAULT '[]'`;
        yield* sql`UPDATE amicited_report_snapshots SET period_label=COALESCE(json_extract(payload_json, '$.period.label'), period_start), comparison_label=json_extract(payload_json, '$.comparison.label'), error_count=(SELECT count(*) FROM json_each(payload_json, '$.errors')), narrative_requested=COALESCE(json_extract(payload_json, '$.narrativeRequested'), 0), narrative_block_ids_json=(SELECT json_group_array(json_extract(b.value, '$.id')) FROM json_each(payload_json, '$.spec.pages') p, json_each(p.value, '$.blocks') b WHERE json_extract(b.value, '$.type')='narrative'), narrative_completed_ids_json=(SELECT json_group_array(key) FROM json_each(payload_json, '$.narrative') WHERE key IS NOT NULL)`;
        yield* sql`CREATE INDEX IF NOT EXISTS amicited_report_snapshots_history ON amicited_report_snapshots(report_id, created_at DESC)`;
        yield* sql`CREATE INDEX IF NOT EXISTS amicited_reports_updated ON amicited_reports(updated_at DESC)`;
        yield* sql`INSERT INTO amicited_reports_migrations(version) VALUES (3)`;
      }
      const normalized = yield* sql<{
        version: number;
      }>`SELECT version FROM amicited_reports_migrations WHERE version=4`;
      if (!normalized.length) {
        yield* sql`UPDATE amicited_report_snapshots SET narrative_completed_ids_json=(SELECT json_group_array(value) FROM json_each(narrative_completed_ids_json) WHERE type='text')`;
        yield* sql`INSERT INTO amicited_reports_migrations(version) VALUES (4)`;
      }
    }),
  );
});
export class Reports extends Context.Service<
  Reports,
  {
    readonly list: (
      projectId?: string,
      archived?: boolean,
    ) => Effect.Effect<readonly ReportSummary[], ReportFailure>;
    readonly get: (id: string, projectId?: string) => Effect.Effect<Report, ReportFailure>;
    readonly create: (input: {
      projectId: string;
      title: string;
      templateId?: string;
    }) => Effect.Effect<Report, ReportFailure>;
    readonly update: (
      input: {
        id: string;
        title?: string;
        spec?: ReportSpec;
        narrativeEnabled?: boolean;
        threadId?: string;
        archivedAt?: string | null;
      },
      projectId?: string,
    ) => Effect.Effect<Report, ReportFailure>;
    readonly remove: (id: string, projectId?: string) => Effect.Effect<void, ReportFailure>;
    readonly deleteProject: (projectId: string) => Effect.Effect<void, ReportFailure>;
    readonly duplicate: (
      id: string,
      targetProjectId: string,
    ) => Effect.Effect<Report, ReportFailure>;
    readonly execute: (
      id: string,
      projectId?: string,
    ) => Effect.Effect<
      {
        report: Report;
        datasets: Record<string, unknown>;
        errors: Record<string, string>;
        context: ExpressionContext;
      },
      ReportFailure
    >;
    readonly run: (id: string, projectId?: string) => Effect.Effect<ReportSnapshot, ReportFailure>;
    readonly snapshotSummaries: (
      reportId: string,
      projectId?: string,
    ) => Effect.Effect<readonly ReportSnapshotSummary[], ReportFailure>;
    readonly snapshotSummary: (id: string) => Effect.Effect<ReportSnapshotSummary, ReportFailure>;
    readonly snapshot: (
      id: string,
      projectId?: string,
    ) => Effect.Effect<ReportSnapshot, ReportFailure>;
    readonly deleteSnapshot: (id: string) => Effect.Effect<void, ReportFailure>;
    readonly narrativeSubmit: (
      snapshotId: string,
      blockId: string,
      markdown: string,
      projectId: string,
      threadId: string,
    ) => Effect.Effect<void, ReportFailure>;
    readonly attachNarrativeThread: (
      id: string,
      threadId: string,
    ) => Effect.Effect<void, ReportFailure>;
    readonly narrativeFinished: (threadId: string) => Effect.Effect<void, ReportFailure>;
    readonly html: (
      id: string,
      mode: "preview" | "snapshot",
      eventsUrl?: string,
    ) => Effect.Effect<string, ReportFailure>;
    readonly pptx: (id: string) => Effect.Effect<Uint8Array, ReportFailure>;
    readonly validate: (id: string, projectId: string) => Effect.Effect<unknown, ReportFailure>;
    readonly changes: Stream.Stream<typeof ReportChange.Type>;
  }
>()("t3/amicited/Reports") {}
export const layer = Layer.effect(
  Reports,
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const random = yield* SecureRandom.SecureRandom;
    const sql = yield* SqlClient.SqlClient;
    const api = yield* ReportsApi.ReportsApi;
    yield* migrate().pipe(Effect.mapError(failure));
    const changes = yield* PubSub.unbounded<typeof ReportChange.Type>();
    const notify = (report: Report, kind: (typeof ReportChange.Type)["kind"]) =>
      PubSub.publish(changes, { projectId: report.projectId, reportId: report.id, kind });
    const get = Effect.fn("Reports.get")(function* (id: string, projectId?: string) {
      const rows = yield* sql<{
        payload_json: string;
      }>`SELECT payload_json FROM amicited_reports WHERE report_id = ${id}`.pipe(
        Effect.mapError(failure),
      );
      const report = yield* Effect.try({
        try: () => parseReport(rows[0]?.payload_json),
        catch: failure,
      });
      if (projectId !== undefined && report.projectId !== projectId) return yield* failure();
      return report;
    });
    const list = Effect.fn("Reports.list")(function* (projectId?: string, archived = false) {
      const rows = yield* sql<
        Omit<ReportSummary, "lastSnapshot" | "narrativeEnabled"> & { narrativeEnabled: number }
      >`SELECT report_id AS id, project_id AS projectId, title, spec_revision AS specRevision, thread_id AS threadId, narrative_enabled AS narrativeEnabled, created_at AS createdAt, updated_at AS updatedAt, archived_at AS archivedAt FROM amicited_reports WHERE (${projectId ?? null} IS NULL OR project_id=${projectId ?? null}) AND (${archived ? 1 : 0}=1 OR archived_at IS NULL) ORDER BY updated_at DESC`.pipe(
        Effect.mapError(failure),
      );
      return yield* Effect.forEach(
        rows,
        (r) =>
          snapshotSummaries(r.id, undefined, 1).pipe(
            Effect.map((history) => ({
              ...r,
              narrativeEnabled: r.narrativeEnabled === 1,
              lastSnapshot: history[0] ?? null,
            })),
          ),
        { concurrency: 4 },
      );
    });
    const persist = Effect.fn("Reports.persist")(function* (r: Report) {
      yield* sql`INSERT INTO amicited_reports ${sql.insert({ report_id: r.id, project_id: r.projectId, title: r.title, spec_revision: r.specRevision, thread_id: r.threadId, narrative_enabled: r.narrativeEnabled ? 1 : 0, created_at: r.createdAt, updated_at: r.updatedAt, archived_at: r.archivedAt, payload_json: encodeJson(r) })}`.pipe(
        Effect.mapError(failure),
      );
      yield* notify(r, "created");
      return r;
    });
    const create = Effect.fn("Reports.create")(function* (input: {
      projectId: string;
      title: string;
      templateId?: string;
    }) {
      yield* api.connection(input.projectId);
      const template = templates.find((t) => t.id === input.templateId);
      if (input.templateId && input.templateId !== "blank" && !template)
        return yield* new ReportFailure({ message: "Unknown report template." });
      const spec = {
        ...(template?.spec ?? templates[0]!.spec),
        title: input.title,
        ...(!input.templateId || input.templateId === "blank"
          ? { queries: {}, pages: [{ blocks: [{ type: "heading" as const, text: input.title }] }] }
          : {}),
      };
      const now = DateTime.formatIso(yield* DateTime.now);
      return yield* persist({
        id: yield* random.uuidV4(),
        projectId: input.projectId,
        title: input.title,
        spec,
        specRevision: 1,
        threadId: null,
        narrativeEnabled: true,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
    });
    const update = Effect.fn("Reports.update")(function* (
      input: {
        id: string;
        title?: string;
        spec?: ReportSpec;
        narrativeEnabled?: boolean;
        threadId?: string;
        archivedAt?: string | null;
      },
      projectId?: string,
    ) {
      return yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const old = yield* get(input.id, projectId);
            const spec = yield* Effect.try({
              try: () =>
                decodeReportSpec({
                  ...(input.spec ?? old.spec),
                  ...(input.title !== undefined ? { title: input.title } : {}),
                }),
              catch: (error) =>
                new ReportFailure({
                  message: `Invalid report spec: ${expressionError(error).slice(0, 4000)}`,
                }),
            });
            const r: Report = {
              ...old,
              ...input,
              spec,
              title: spec.title,
              specRevision: old.specRevision + (encodeJson(spec) === encodeJson(old.spec) ? 0 : 1),
              updatedAt: DateTime.formatIso(yield* DateTime.now),
            };
            yield* sql`UPDATE amicited_reports SET title=${r.title}, spec_revision=${r.specRevision}, thread_id=${r.threadId}, narrative_enabled=${r.narrativeEnabled ? 1 : 0}, updated_at=${r.updatedAt}, archived_at=${r.archivedAt}, payload_json=${encodeJson(r)} WHERE report_id=${r.id}`;
            return r;
          }),
        )
        .pipe(
          Effect.mapError(failure),
          Effect.tap((r) => notify(r, "updated")),
        );
    });
    const remove = Effect.fn("Reports.remove")(function* (id: string, projectId?: string) {
      const r = yield* get(id, projectId);
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM amicited_report_snapshots WHERE report_id=${id}`;
            yield* sql`DELETE FROM amicited_reports WHERE report_id=${id}`;
          }),
        )
        .pipe(Effect.mapError(failure));
      yield* notify(r, "deleted");
    });
    const deleteProject = Effect.fn("Reports.deleteProject")(function* (projectId: string) {
      const rows = yield* sql<{
        report_id: string;
      }>`SELECT report_id FROM amicited_reports WHERE project_id=${projectId}`.pipe(
        Effect.mapError(failure),
      );
      yield* sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM amicited_report_snapshots WHERE report_id IN (SELECT report_id FROM amicited_reports WHERE project_id=${projectId})`;
            yield* sql`DELETE FROM amicited_reports WHERE project_id=${projectId}`;
          }),
        )
        .pipe(Effect.mapError(failure));
      yield* Effect.forEach(
        rows,
        (row) =>
          PubSub.publish(changes, { projectId, reportId: row.report_id, kind: "deleted" as const }),
        { discard: true },
      );
    });
    const duplicate = Effect.fn("Reports.duplicate")(function* (
      id: string,
      targetProjectId: string,
    ) {
      const old = yield* get(id);
      yield* api.connection(targetProjectId);
      const now = DateTime.formatIso(yield* DateTime.now);
      return yield* persist({
        ...old,
        id: yield* random.uuidV4(),
        projectId: targetProjectId,
        threadId: null,
        specRevision: 1,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
    });
    const cache = new Map<string, { expires: number; bytes: number; value: unknown }>();
    let cacheBytes = 0;
    const execute = Effect.fn("Reports.execute")(function* (
      id: string,
      projectId?: string,
      cached = false,
    ) {
      const report = yield* get(id, projectId);
      const connection = yield* api.connection(report.projectId);
      const context = {
        ...connection,
        ...resolvePeriod(report.spec.period),
        report: { title: report.title },
      };
      const requests = yield* Effect.tryPromise({
        try: () => resolveQueries(report.spec, context),
        catch: (error) => new ReportFailure({ message: expressionError(error) }),
      });
      const fetcher = yield* api.fetcher(report.projectId);
      const pending = new Map<string, Promise<unknown>>();
      const result = yield* Effect.tryPromise({
        try: () =>
          runQueries(requests, (path, params, signal) => {
            const key = encodeJson([report.projectId, path, params]);
            const saved = cache.get(key);
            if (cached && saved && saved.expires > clock.currentTimeMillisUnsafe())
              return Promise.resolve(saved.value);
            let promise = pending.get(key);
            if (!promise) {
              promise = fetcher(path, params, signal).then((value) => {
                if (cached) {
                  const bytes = Buffer.byteLength(encodeJson(value));
                  if (bytes <= 10 * 1024 * 1024) {
                    cacheBytes -= cache.get(key)?.bytes ?? 0;
                    if (cacheBytes + bytes > 10 * 1024 * 1024 || cache.size >= 100) {
                      cache.clear();
                      cacheBytes = 0;
                    }
                    cache.set(key, {
                      value,
                      bytes,
                      expires: clock.currentTimeMillisUnsafe() + 600000,
                    });
                    cacheBytes += bytes;
                  }
                }
                return value;
              });
              pending.set(key, promise);
            }
            return promise;
          }),
        catch: failure,
      });
      return { report, ...result, context };
    });
    const saveSnapshot = Effect.fn("Reports.saveSnapshot")(function* (
      s: ReportSnapshot,
      renderContext: { context: ExpressionContext; logoDataUrl?: string },
    ) {
      const render_context_json = encodeJson(renderContext);
      yield* sql`INSERT OR REPLACE INTO amicited_report_snapshots ${sql.insert({
        snapshot_id: s.id,
        report_id: s.reportId,
        spec_revision: s.specRevision,
        period_start: s.period.start,
        period_end: s.period.end,
        comparison_start: s.comparison?.start ?? null,
        comparison_end: s.comparison?.end ?? null,
        narrative_thread_id: s.narrativeThreadId,
        status: s.status,
        created_at: s.createdAt,
        period_label: s.period.label,
        comparison_label: s.comparison?.label ?? null,
        error_count: Object.keys(s.errors).length,
        narrative_requested: s.narrativeRequested ? 1 : 0,
        narrative_block_ids_json: encodeJson(
          s.spec.pages
            .flatMap((p) => p.blocks)
            .filter((b) => b.type === "narrative")
            .map((b) => b.id),
        ),
        narrative_completed_ids_json: encodeJson(Object.keys(s.narrative ?? {})),
        render_context_json,
        payload_json: encodeJson(s),
      })}`;
    }, Effect.mapError(failure));
    const run = Effect.fn("Reports.run")(function* (id: string, projectId?: string) {
      const { report, datasets, errors, context } = yield* execute(id, projectId);
      if (Buffer.byteLength(encodeJson(datasets)) > 10 * 1024 * 1024)
        return yield* new ReportFailure({
          message: "Report datasets exceed the 10 MB snapshot limit.",
        });
      const snapshot: ReportSnapshot = {
        id: yield* random.uuidV4(),
        reportId: id,
        specRevision: report.specRevision,
        spec: report.spec,
        period: context.period,
        comparison: context.comparison,
        datasets,
        errors,
        narrative: null,
        narrativeThreadId: null,
        narrativeRequested:
          report.narrativeEnabled &&
          report.spec.pages.some((p) => p.blocks.some((b) => b.type === "narrative")),
        status: Object.keys(errors).length
          ? Object.keys(datasets).length
            ? "partial"
            : "failed"
          : "ready",
        createdAt: DateTime.formatIso(yield* DateTime.now),
      };
      const branding = yield* api.branding(report.projectId, report.spec.theme.logo);
      yield* saveSnapshot(snapshot, {
        context: {
          domain: context.domain,
          period: context.period,
          comparison: context.comparison,
          report: context.report,
        },
        ...(branding.logoDataUrl ? { logoDataUrl: branding.logoDataUrl } : {}),
      });
      yield* notify(report, "snapshot");
      return snapshot;
    });
    const snapshotSummaries = Effect.fn("Reports.snapshotSummaries")(function* (
      reportId: string,
      projectId?: string,
      limit = -1,
    ) {
      const parent = yield* sql<{
        project_id: string;
      }>`SELECT project_id FROM amicited_reports WHERE report_id=${reportId}`.pipe(
        Effect.mapError(failure),
      );
      if (!parent[0] || (projectId !== undefined && parent[0].project_id !== projectId))
        return yield* failure();
      const rows = yield* sql<{
        snapshot_id: string;
        report_id: string;
        spec_revision: number;
        narrative_requested: number;
        narrative_block_ids_json: string;
        narrative_completed_ids_json: string;
        error_count: number;
        period_label: string;
        comparison_label: string | null;
        period_start: string;
        period_end: string;
        comparison_start: string | null;
        comparison_end: string | null;
        narrative_thread_id: string | null;
        status: ReportSnapshotSummary["status"];
        created_at: string;
      }>`SELECT snapshot_id, report_id, spec_revision, period_label, comparison_label, period_start, period_end, comparison_start, comparison_end, error_count, narrative_requested, narrative_block_ids_json, narrative_completed_ids_json, narrative_thread_id, status, created_at FROM amicited_report_snapshots WHERE report_id=${reportId} ORDER BY created_at DESC LIMIT ${limit}`.pipe(
        Effect.mapError(failure),
      );
      const threads = yield* Effect.serviceOption(ThreadManagement.ThreadManagementService);
      return yield* Effect.forEach(
        rows,
        (row) =>
          Effect.gen(function* () {
            const blocks = decodeIds(row.narrative_block_ids_json);
            const completed = new Set(decodeIds(row.narrative_completed_ids_json));
            let state: ReportSnapshotSummary["narrative"] =
              !row.narrative_requested || !blocks.length
                ? "off"
                : blocks.every((id) => completed.has(id))
                  ? "ready"
                  : row.narrative_thread_id === null &&
                      clock.currentTimeMillisUnsafe() - Date.parse(row.created_at) < 120000
                    ? "writing"
                    : "failed";
            if (state === "failed" && row.narrative_thread_id && Option.isSome(threads)) {
              const thread = yield* threads.value
                .getThreadShell(ThreadId.make(row.narrative_thread_id))
                .pipe(Effect.orElseSucceed(() => null));
              if (thread && thread.deletedAt === null && thread.activeRunId) state = "writing";
            }
            return {
              id: row.snapshot_id,
              reportId: row.report_id,
              specRevision: row.spec_revision,
              period: {
                start: row.period_start,
                end: row.period_end,
                label: row.period_label,
              },
              comparison:
                row.comparison_start && row.comparison_end
                  ? {
                      start: row.comparison_start,
                      end: row.comparison_end,
                      label:
                        row.comparison_label ?? `${row.comparison_start} – ${row.comparison_end}`,
                    }
                  : null,
              status: row.status,
              errorCount: row.error_count,
              narrative: state,
              createdAt: row.created_at,
            };
          }),
        { concurrency: 4 },
      );
    });
    const snapshotSummary = Effect.fn("Reports.snapshotSummary")(function* (id: string) {
      const rows = yield* sql<{
        report_id: string;
      }>`SELECT report_id FROM amicited_report_snapshots WHERE snapshot_id=${id}`.pipe(
        Effect.mapError(failure),
      );
      if (!rows[0]) return yield* failure();
      return (yield* snapshotSummaries(rows[0].report_id)).find((s) => s.id === id)!;
    });
    const snapshot = Effect.fn("Reports.snapshot")(function* (id: string, projectId?: string) {
      const rows = yield* sql<{
        payload_json: string;
      }>`SELECT payload_json FROM amicited_report_snapshots WHERE snapshot_id=${id}`.pipe(
        Effect.mapError(failure),
      );
      const s = yield* Effect.try({
        try: () => parseSnapshot(rows[0]?.payload_json),
        catch: failure,
      });
      yield* get(s.reportId, projectId);
      return s;
    });
    const deleteSnapshot = Effect.fn("Reports.deleteSnapshot")(function* (id: string) {
      const s = yield* snapshot(id);
      yield* sql`DELETE FROM amicited_report_snapshots WHERE snapshot_id=${id}`.pipe(
        Effect.mapError(failure),
      );
      yield* notify(yield* get(s.reportId), "snapshot");
    });
    const attachNarrativeThread = Effect.fn("Reports.attachNarrativeThread")(function* (
      id: string,
      threadId: string,
    ) {
      const s = yield* snapshot(id);
      yield* sql`UPDATE amicited_report_snapshots SET narrative_thread_id=${threadId}, payload_json=json_set(payload_json, '$.narrativeThreadId', ${threadId}) WHERE snapshot_id=${id}`.pipe(
        Effect.mapError(failure),
      );
      yield* notify(yield* get(s.reportId), "snapshot");
    });
    const narrativeSubmit = Effect.fn("Reports.narrativeSubmit")(function* (
      snapshotId: string,
      blockId: string,
      markdown: string,
      projectId: string,
      threadId: string,
    ) {
      return yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const s = yield* snapshot(snapshotId, projectId);
            if (
              !s.narrativeRequested ||
              s.narrativeThreadId !== threadId ||
              !s.spec.pages.some((p) =>
                p.blocks.some((b) => b.type === "narrative" && b.id === blockId),
              ) ||
              markdown.length > 50000
            )
              return yield* failure();
            yield* sql`UPDATE amicited_report_snapshots SET narrative_completed_ids_json=${encodeJson(Object.keys({ ...s.narrative, [blockId]: markdown }))}, payload_json=json_set(payload_json, '$.narrative', json(${encodeJson({ ...s.narrative, [blockId]: markdown })})) WHERE snapshot_id=${snapshotId}`;
            yield* notify(yield* get(s.reportId), "snapshot");
          }),
        )
        .pipe(Effect.mapError(failure));
    });
    const narrativeFinished = Effect.fn("Reports.narrativeFinished")(function* (threadId: string) {
      const rows = yield* sql<{
        report_id: string;
      }>`SELECT report_id FROM amicited_report_snapshots WHERE narrative_thread_id=${threadId}`.pipe(
        Effect.mapError(failure),
      );
      yield* Effect.forEach(
        rows,
        (row) => get(row.report_id).pipe(Effect.flatMap((r) => notify(r, "snapshot"))),
        { discard: true },
      );
    });
    const snapshotOptions = Effect.fn("Reports.snapshotOptions")(function* (id: string) {
      const s = yield* snapshot(id);
      const rows = yield* sql<{
        render_context_json: string | null;
      }>`SELECT render_context_json FROM amicited_report_snapshots WHERE snapshot_id=${id}`.pipe(
        Effect.mapError(failure),
      );
      if (!rows[0]?.render_context_json)
        return yield* new ReportFailure({
          message: "This snapshot is missing its frozen render context.",
        });
      const frozen = yield* Effect.try({
        try: () => decodeRenderContext(rows[0]!.render_context_json!),
        catch: failure,
      });
      const spec = s.narrativeRequested
        ? s.spec
        : {
            ...s.spec,
            pages: s.spec.pages.map((p) => ({
              ...p,
              blocks: p.blocks.filter((b) => b.type !== "narrative"),
            })),
          };
      return { ...s, spec, ...frozen, generatedAt: s.createdAt, mode: "snapshot" as const };
    });
    const html = Effect.fn("Reports.html")(function* (
      id: string,
      mode: "preview" | "snapshot",
      eventsUrl?: string,
    ) {
      if (mode === "snapshot") {
        const options = yield* snapshotOptions(id);
        return yield* Effect.tryPromise({ try: () => renderReportHtml(options), catch: failure });
      }
      const result = yield* execute(id, undefined, true);
      const branding = yield* api.branding(result.report.projectId, result.report.spec.theme.logo);
      return yield* Effect.tryPromise({
        try: () =>
          renderReportHtml({
            ...result,
            ...branding,
            spec: result.report.spec,
            mode,
            ...(eventsUrl ? { eventsUrl } : {}),
          }),
        catch: failure,
      });
    });
    const pptx = Effect.fn("Reports.pptx")(function* (id: string) {
      const options = yield* snapshotOptions(id);
      return yield* Effect.tryPromise({ try: () => renderReportPptx(options), catch: failure });
    });
    const validate = Effect.fn("Reports.validate")(function* (id: string, projectId: string) {
      const result = yield* execute(id, projectId, true);
      const problems: Array<{ page: number; block: number; message: string }> = [];
      yield* Effect.tryPromise({
        try: () =>
          renderReportHtml({
            ...result,
            spec: result.report.spec,
            mode: "snapshot",
            onProblem: (p) => problems.push(p),
          }),
        catch: failure,
      });
      return {
        report: result.report,
        errors: result.errors,
        problems,
        samples: Object.fromEntries(
          Object.entries(result.datasets).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.slice(0, 3) : encodeJson(v).slice(0, 2000),
          ]),
        ),
      };
    });
    return {
      narrativeFinished,
      snapshotSummaries,
      snapshotSummary,
      validate,
      list,
      get,
      create,
      update,
      remove,
      deleteProject,
      duplicate,
      execute,
      run,
      snapshot,
      deleteSnapshot,
      narrativeSubmit,
      attachNarrativeThread,
      html,
      pptx,
      changes: Stream.fromPubSub(changes),
    };
  }),
);

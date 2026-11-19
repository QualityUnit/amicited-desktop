import { toolData, type CloudClient } from "@amicited/cloud-client";
import {
  SYNC_BATCH,
  SYNC_WINDOW_MS,
  itemDisposition,
  localResult,
  localResultKey,
  syncBackoff,
  syncMessages,
  syncProblem,
  uploadOutcomes,
  type LocalResult,
  type SyncProblem,
} from "@amicited/cloud-client/localResults";
import type { TrackingRun, TrackingSync } from "@amicited/cloud-client/tracking";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/sql/SqlClient";

const decodeResult = Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown));
const encodeResult = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const HOUR = 3_600_000;
/** Plan, role and domain refusals do not change by retrying; the next run or six hours retries. */
const BLOCKED_RETRY = 6 * HOUR;
const MAX_BATCHES = 20;
const iso = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));
class SyncUploadError extends Schema.TaggedError<SyncUploadError>()("SyncUploadError", {
  message: Schema.String,
}) {}

interface OutboxRow {
  key: string;
  prompt: string;
  payload: string;
  attempts: number;
}

/**
 * The persisted outbox that uploads local tracking answers to the domain's AmICited
 * workspace. One row per prompt × engine × country × UTC day, like the cloud's ledger:
 * an accepted row is never sent again, a refused one is dropped, and only conflicts,
 * partial writes and unreachable or refusing servers are retried, with backoff.
 */
export const makeTrackingSync = Effect.fn("TrackingSync.make")(function* (cloud: CloudClient) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS amicited_tracking_sync_migrations (migration_id INTEGER PRIMARY KEY)`;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      if (
        (yield* sql`SELECT 1 FROM amicited_tracking_sync_migrations WHERE migration_id = 1`).length
      )
        return;
      yield* sql`CREATE TABLE amicited_tracking_outbox (project_id TEXT NOT NULL, key TEXT NOT NULL, prompt TEXT NOT NULL, payload TEXT NOT NULL, answered INTEGER NOT NULL, state TEXT NOT NULL, outcome TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL DEFAULT 0, solo INTEGER NOT NULL DEFAULT 0, checked_at TEXT NOT NULL, PRIMARY KEY (project_id, key))`;
      yield* sql`CREATE TABLE amicited_tracking_sync (project_id TEXT PRIMARY KEY, problem TEXT, synced_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0)`;
      yield* sql`INSERT INTO amicited_tracking_sync_migrations VALUES (1)`;
    }),
  );
  const lock = yield* Semaphore.make(1);
  const domains = () =>
    Effect.promise(async () => (await cloud.domains?.metadata().catch(() => [])) ?? []);

  const setProblem = Effect.fn("TrackingSync.setProblem")(function* (
    projectId: string,
    problem: SyncProblem | "not_linked" | null,
    retryAt: number,
    attempts: number,
  ) {
    const [before] = yield* sql<{
      problem: string | null;
    }>`SELECT problem FROM amicited_tracking_sync WHERE project_id = ${projectId}`;
    yield* sql`INSERT INTO amicited_tracking_sync (project_id, problem, attempts, retry_at) VALUES (${projectId}, ${problem}, ${attempts}, ${retryAt}) ON CONFLICT(project_id) DO UPDATE SET problem = excluded.problem, attempts = excluded.attempts, retry_at = excluded.retry_at`;
    return (before?.problem ?? null) !== problem;
  });

  const record = Effect.fn("TrackingSync.record")(function* (run: TrackingRun) {
    const domain = (yield* domains()).find((d) => d.projectId === run.projectId);
    const brand = domain?.brand || domain?.hostname || "";
    let added = false;
    for (const answer of run.answers) {
      const item = localResult(answer, brand);
      if (!item) continue;
      const key = localResultKey(item);
      const answered = item.status === "answered" ? 1 : 0;
      const payload = yield* encodeResult(item);
      const [row] = yield* sql<{
        state: string;
        answered: number;
      }>`SELECT state, answered FROM amicited_tracking_outbox WHERE project_id = ${run.projectId} AND key = ${key}`;
      if (!row) {
        yield* sql`INSERT INTO amicited_tracking_outbox (project_id, key, prompt, payload, answered, state, checked_at) VALUES (${run.projectId}, ${key}, ${item.prompt.toLowerCase()}, ${payload}, ${answered}, 'pending', ${item.checked_at})`;
        added = true;
      } else if (row.state !== "dropped" && !row.answered && answered) {
        // The cloud stores an answer over an earlier failed check of the same day.
        yield* sql`UPDATE amicited_tracking_outbox SET payload = ${payload}, answered = 1, state = 'pending', outcome = NULL, attempts = 0, next_at = 0, solo = 0, checked_at = ${item.checked_at} WHERE project_id = ${run.projectId} AND key = ${key}`;
        added = true;
      } else if (row.state === "pending" && !row.answered) {
        yield* sql`UPDATE amicited_tracking_outbox SET payload = ${payload} WHERE project_id = ${run.projectId} AND key = ${key}`;
      }
    }
    // New answers retry a paused domain now: the plan or role may have changed since.
    if (added)
      yield* sql`UPDATE amicited_tracking_sync SET retry_at = 0, attempts = 0 WHERE project_id = ${run.projectId}`;
    return added;
  });

  const upload = Effect.fn("TrackingSync.upload")(function* (
    projectId: string,
    client: CloudClient,
    domainId: string,
    rows: readonly OutboxRow[],
  ) {
    const results: LocalResult[] = [];
    for (const row of rows) results.push((yield* decodeResult(row.payload)) as LocalResult);
    const response = yield* Effect.result(
      Effect.tryPromise({
        try: () =>
          client.call("submit_local_results", {
            submission: { domain_id: domainId, collector: "desktop", results },
          }),
        catch: (error) =>
          new SyncUploadError({ message: error instanceof Error ? error.message : String(error) }),
      }),
    );
    if (Result.isFailure(response)) return syncProblem(response.failure.message);
    if (response.success.isError) return syncProblem(response.success);
    const outcomes = uploadOutcomes(toolData(response.success));
    if (!outcomes) return syncProblem("AmICited sent an unreadable reply.");
    const now = yield* Clock.currentTimeMillis;
    const stopped = new Set<string>();
    for (const [index, row] of rows.entries()) {
      const outcome =
        outcomes.find((o) => (o as { index?: unknown } | null)?.index === index) ?? outcomes[index];
      const next = itemDisposition(outcome, now, row.attempts);
      yield* sql`UPDATE amicited_tracking_outbox SET state = ${next.state}, outcome = ${next.outcome}, attempts = attempts + ${next.state === "pending" ? 1 : 0}, next_at = ${next.state === "pending" ? next.at : 0} WHERE project_id = ${projectId} AND key = ${row.key}`;
      if (next.state === "dropped" && next.stopPrompt) stopped.add(row.prompt);
    }
    for (const prompt of stopped)
      yield* sql`UPDATE amicited_tracking_outbox SET state = 'dropped', outcome = 'prompt_limit_reached' WHERE project_id = ${projectId} AND prompt = ${prompt} AND state = 'pending'`;
    return null;
  });

  const drainProject = Effect.fn("TrackingSync.drainProject")(function* (projectId: string) {
    const domain = (yield* domains()).find((d) => d.projectId === projectId);
    if (!cloud.account || !domain?.workspaceId || !domain.domainId)
      return yield* setProblem(projectId, "not_linked", 0, 0);
    const client = cloud.account.client(domain.workspaceId);
    let changed = false;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const now = yield* Clock.currentTimeMillis;
      let rows =
        yield* sql<OutboxRow>`SELECT key, prompt, payload, attempts FROM amicited_tracking_outbox WHERE project_id = ${projectId} AND state = 'pending' AND next_at <= ${now} AND solo = 0 ORDER BY checked_at, rowid LIMIT ${SYNC_BATCH}`;
      if (!rows.length)
        rows =
          yield* sql<OutboxRow>`SELECT key, prompt, payload, attempts FROM amicited_tracking_outbox WHERE project_id = ${projectId} AND state = 'pending' AND next_at <= ${now} ORDER BY checked_at, rowid LIMIT 1`;
      if (!rows.length) break;
      const problem = yield* upload(projectId, client, domain.domainId, rows);
      changed = true;
      if (problem === "malformed") {
        // One bad answer fails the whole batch; send them one by one, and drop one that fails alone.
        for (const row of rows)
          yield* rows.length > 1
            ? sql`UPDATE amicited_tracking_outbox SET solo = 1 WHERE project_id = ${projectId} AND key = ${row.key}`
            : sql`UPDATE amicited_tracking_outbox SET state = 'dropped', outcome = 'malformed' WHERE project_id = ${projectId} AND key = ${row.key}`;
        continue;
      }
      if (problem) {
        const [state] = yield* sql<{
          attempts: number;
        }>`SELECT attempts FROM amicited_tracking_sync WHERE project_id = ${projectId}`;
        const attempts = state?.attempts ?? 0;
        const wait =
          problem === "offline" || problem === "error" ? syncBackoff(attempts) : BLOCKED_RETRY;
        yield* setProblem(projectId, problem, now + wait, attempts + 1);
        return true;
      }
      yield* sql`INSERT INTO amicited_tracking_sync (project_id, problem, synced_at, attempts, retry_at) VALUES (${projectId}, NULL, ${iso(now)}, 0, 0) ON CONFLICT(project_id) DO UPDATE SET problem = NULL, synced_at = excluded.synced_at, attempts = 0, retry_at = 0`;
    }
    return changed;
  });

  /** Uploads every due answer; true when anything a viewer sees changed. */
  const drain = Effect.fn("TrackingSync.drain")(function* () {
    return yield* lock.withPermits(1)(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        // An hour's margin keeps an answer from crossing the cloud's cutoff in flight.
        const expired = iso(now - SYNC_WINDOW_MS + HOUR);
        yield* sql`UPDATE amicited_tracking_outbox SET state = 'dropped', outcome = 'too_old' WHERE state = 'pending' AND checked_at < ${expired}`;
        yield* sql`DELETE FROM amicited_tracking_outbox WHERE state != 'pending' AND checked_at < ${iso(now - SYNC_WINDOW_MS - 7 * 24 * HOUR)}`;
        const projects = yield* sql<{
          project_id: string;
        }>`SELECT DISTINCT o.project_id FROM amicited_tracking_outbox o LEFT JOIN amicited_tracking_sync s ON s.project_id = o.project_id WHERE o.state = 'pending' AND o.next_at <= ${now} AND COALESCE(s.retry_at, 0) <= ${now}`;
        let changed = false;
        for (const { project_id } of projects)
          changed = (yield* drainProject(project_id)) || changed;
        return changed;
      }),
    );
  });

  const status = Effect.fn("TrackingSync.status")(function* () {
    const rows = yield* sql<{
      project_id: string;
      pending: number;
      skipped: number;
      problem: SyncProblem | "not_linked" | null;
      synced_at: string | null;
    }>`SELECT o.project_id, SUM(o.state = 'pending') AS pending, SUM(o.state = 'dropped') AS skipped, s.problem, s.synced_at FROM amicited_tracking_outbox o LEFT JOIN amicited_tracking_sync s ON s.project_id = o.project_id GROUP BY o.project_id`;
    return rows.map((r): TrackingSync => {
      const problem = r.problem === "malformed" ? "error" : r.problem;
      const pending = Number(r.pending);
      return {
        projectId: r.project_id,
        state: problem ?? (pending ? "pending" : r.synced_at ? "synced" : "error"),
        message: problem
          ? syncMessages[problem]
          : pending
            ? `${pending} answers waiting to sync to AmICited.`
            : r.synced_at
              ? "Synced to AmICited."
              : "Not synced: AmICited refused these answers.",
        lastSyncedAt: r.synced_at,
        pending,
        skipped: Number(r.skipped),
      };
    });
  });

  return { record, drain, status };
});
export type TrackingSyncEngine = Effect.Success<ReturnType<typeof makeTrackingSync>>;

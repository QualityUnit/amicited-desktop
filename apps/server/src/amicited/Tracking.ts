import * as Fiber from "effect/Fiber";
import * as Random from "effect/Random";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as DateTime from "effect/DateTime";
import {
  TrackingFailure,
  TrackingConfig,
  TrackingRun,
  detectCountry,
  scheduleDays,
  suggestPrompts,
  parseAnswer,
  trackingFindings,
  type TrackingSnapshot,
  type TrackingUsage,
  type SaveTrackingResult,
} from "@amicited/cloud-client/tracking";
import * as Semaphore from "effect/Semaphore";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import { AmicitedCloud } from "./Cloud.ts";
import { Connections } from "./Connections.ts";
import { AmicitedIssues } from "./Issues.ts";
import chatgpt from "./trackingAdapters/chatgpt.ts";
import perplexity from "./trackingAdapters/perplexity.ts";
import gemini from "./trackingAdapters/gemini.ts";
import claude from "./trackingAdapters/claude.ts";
import google from "./trackingAdapters/google.ts";
const decodeConfig = Schema.decodeEffect(Schema.fromJsonString(TrackingConfig));
const decodeRun = Schema.decodeEffect(Schema.fromJsonString(TrackingRun));
const encodeConfig = Schema.encodeEffect(Schema.fromJsonString(TrackingConfig));
const encodeRun = Schema.encodeEffect(Schema.fromJsonString(TrackingRun));
import google_overviews from "./trackingAdapters/googleOverviews.ts";
const adapters = { chatgpt, perplexity, gemini, claude, google, google_overviews };
export class Tracking extends Context.Service<
  Tracking,
  {
    snapshot: () => Effect.Effect<TrackingSnapshot, TrackingFailure>;
    subscribe: () => Stream.Stream<TrackingSnapshot, TrackingFailure>;
    save: (
      config: TrackingConfig,
      replacePromptId?: string,
    ) => Effect.Effect<SaveTrackingResult, TrackingFailure>;
    suggest: (
      projectId: string,
      category: string,
    ) => Effect.Effect<readonly string[], TrackingFailure>;
    stopNow: (projectId: string) => Effect.Effect<string, TrackingFailure>;
    runNow: (projectId: string) => Effect.Effect<string, TrackingFailure>;
    tick: Effect.Effect<void, TrackingFailure>;
  }
>()("t3/amicited/Tracking") {}
const failure = () => new TrackingFailure({ message: "Could not update AI visibility tracking." });
export const layer = Layer.effect(
  Tracking,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const cloud = yield* AmicitedCloud;
    const connections = yield* Connections;
    const issues = yield* AmicitedIssues;
    const scope = yield* Effect.scope;
    const random = yield* SecureRandom.SecureRandom;
    const changes = yield* PubSub.sliding<void>(1);
    const notify = PubSub.publish(changes, undefined);
    yield* sql`CREATE TABLE IF NOT EXISTS amicited_tracking_migrations (migration_id INTEGER PRIMARY KEY)`;
    yield* sql.withTransaction(
      Effect.gen(function* () {
        const rows =
          yield* sql`SELECT migration_id FROM amicited_tracking_migrations WHERE migration_id = 1`;
        if (rows.length) return;
        yield* sql`CREATE TABLE amicited_tracking_config (project_id TEXT PRIMARY KEY, value TEXT NOT NULL, configured_day TEXT NOT NULL)`;
        yield* sql`CREATE TABLE amicited_tracking_runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, day TEXT NOT NULL, status TEXT NOT NULL, value TEXT NOT NULL)`;
        yield* sql`CREATE TABLE amicited_tracking_computer (id INTEGER PRIMARY KEY, country TEXT NOT NULL)`;
        yield* sql`INSERT INTO amicited_tracking_computer VALUES (1, ${detectCountry()})`;
        yield* sql`INSERT INTO amicited_tracking_migrations VALUES (1)`;
      }),
    );
    const country = (yield* sql<{
      country: string;
    }>`SELECT country FROM amicited_tracking_computer WHERE id = 1`)[0]!.country;
    // A restart cannot resume a browser page; retain partial answers for the next check.
    const configs = Effect.fn("Tracking.configs")(function* () {
      const rows = yield* sql<{ value: string }>`SELECT value FROM amicited_tracking_config`;
      return yield* Effect.forEach(rows, (r) => decodeConfig(r.value));
    });
    const runs = Effect.fn("Tracking.runs")(function* () {
      const rows = yield* sql<{
        value: string;
      }>`SELECT value FROM (SELECT value, day, rowid AS sequence, status, ROW_NUMBER() OVER (PARTITION BY project_id, (status = 'missed') ORDER BY day DESC, rowid DESC) AS rank FROM amicited_tracking_runs) WHERE rank <= CASE WHEN status = 'missed' THEN 14 ELSE 2 END ORDER BY day DESC, sequence DESC`;
      return yield* Effect.forEach(rows, (r) => decodeRun(r.value));
    });
    const metadata = Effect.fn("Tracking.metadata")(function* () {
      return yield* Effect.tryPromise({
        try: async () => ({
          domains: (await cloud.domains?.metadata()) ?? [],
          account: await cloud.account?.status(),
        }),
        catch: failure,
      });
    });
    const usage = (
      cs: readonly TrackingConfig[],
      meta: Effect.Success<ReturnType<typeof metadata>>,
    ): TrackingUsage => {
      const domains = cs.flatMap((c) => {
        const d = meta.domains.find((d) => d.projectId === c.projectId);
        const w = meta.account?.workspaces.find((w) => w.id === d?.workspaceId);
        return d && w?.access !== "full"
          ? [
              {
                projectId: c.projectId,
                hostname: d.hostname,
                workspaceId: d.workspaceId ?? "",
                count: c.prompts.filter((p) => p.enabled).length,
              },
            ]
          : [];
      });
      return { used: domains.reduce((a, d) => a + d.count, 0), limit: 20, domains };
    };
    const snapshot = Effect.fn("Tracking.snapshot")(function* () {
      const cs = yield* configs();
      return { country, configs: cs, runs: yield* runs(), usage: usage(cs, yield* metadata()) };
    }, Effect.mapError(failure));
    const syncUsage = Effect.fn("Tracking.syncUsage")(function* () {
      const s = yield* snapshot();
      connections.engine.setDailyUsage(s.usage);
      for (const c of s.configs)
        for (const e of ["chatgpt", "perplexity", "gemini", "claude", "google"] as const) {
          const count = s.usage.domains.find((d) => d.projectId === c.projectId)?.count ?? 0;
          if (
            count &&
            (c.engines.includes(e) || (e === "google" && c.engines.includes("google_overviews")))
          )
            connections.engine.registerUsage(e, {
              id: `tracking:${c.projectId}`,
              label: `Prompt tracking · ${s.usage.domains.find((d) => d.projectId === c.projectId)!.hostname} · ${count} prompts a day`,
            });
          else connections.engine.unregisterUsage(e, `tracking:${c.projectId}`);
        }
    });
    const save = Effect.fn("Tracking.save")(function* (
      config: TrackingConfig,
      replacePromptId?: string,
    ) {
      const meta = yield* metadata();
      const d = meta.domains.find((d) => d.projectId === config.projectId);
      if (!d?.workspaceId)
        return yield* new TrackingFailure({ message: "Add this domain to a workspace first." });
      if (meta.account?.workspaces.find((w) => w.id === d.workspaceId)?.access === "full")
        return { status: "cloud" } as const;
      if (
        config.country !== country ||
        config.prompts.some((p) => !p.text.trim()) ||
        new Set(config.prompts.map((p) => p.id)).size !== config.prompts.length
      )
        return yield* new TrackingFailure({
          message: "Use this computer's country and unique, non-empty prompts.",
        });
      const configuredDay = scheduleDays(
        DateTime.toDate(yield* DateTime.now),
        config.time,
        undefined,
      ).day;
      const result = yield* sql.withTransaction(
        Effect.gen(function* () {
          const cs = [...(yield* configs())]
            .filter((c) => c.projectId !== config.projectId)
            .map((c) => ({
              ...c,
              prompts: c.prompts.map((p) =>
                p.id === replacePromptId ? { ...p, enabled: false } : p,
              ),
            }));
          const next = {
            ...config,
            engines: [...new Set(config.engines)],
            prompts: config.prompts.map((p) =>
              p.id === replacePromptId ? { ...p, enabled: false } : p,
            ),
          };
          cs.push(next);
          const used = usage(cs, meta);
          if (used.used > 20)
            return { status: "limit_reached", usage: usage(yield* configs(), meta) } as const;
          for (const c of cs)
            yield* sql`INSERT INTO amicited_tracking_config VALUES (${c.projectId},${yield* encodeConfig(c)},${configuredDay}) ON CONFLICT(project_id) DO UPDATE SET value=excluded.value`;
          return { status: "saved" } as const;
        }),
      );
      yield* syncUsage();
      yield* notify;
      return result;
    }, Effect.mapError(failure));
    const persistRun = Effect.fn("Tracking.persistRun")(function* (r: TrackingRun) {
      yield* sql`INSERT INTO amicited_tracking_runs VALUES (${r.id},${r.projectId},${r.day},${r.status},${yield* encodeRun(r)}) ON CONFLICT(id) DO UPDATE SET value=excluded.value, status=excluded.status`;
      yield* notify;
    });
    const lock = yield* Semaphore.make(1);
    const active = new Map<string, string>();
    const runningFibers = new Map<string, Fiber.Fiber<void, TrackingFailure>>();
    const startLock = yield* Semaphore.make(1);
    const execute = Effect.fn("Tracking.execute")(function* (c: TrackingConfig, r: TrackingRun) {
      const meta = yield* metadata();
      const d = meta.domains.find((d) => d.projectId === c.projectId);
      if (!d || meta.account?.workspaces.find((w) => w.id === d.workspaceId)?.access === "full")
        return;
      const previous = (yield* runs()).find(
        (x) => x.projectId === c.projectId && x.status === "complete",
      );
      let answers = [...r.answers];
      for (const engine of c.engines)
        for (const p of c.prompts.filter((p) => p.enabled)) {
          if (
            answers.some(
              (a) => a.engine === engine && a.promptId === p.id && a.status === "answered",
            )
          )
            continue;
          const result = yield* connections
            .run((e) =>
              e.withSiteSession(engine === "google_overviews" ? "google" : engine, (page) =>
                adapters[engine](page, p.text),
              ),
            )
            .pipe(Effect.orElseSucceed(() => null));
          const answer = {
            promptId: p.id,
            prompt: p.text,
            engine,
            status:
              result === null
                ? ("failed" as const)
                : result.status === "needs_sign_in"
                  ? ("needs_sign_in" as const)
                  : ("answered" as const),
            ...parseAnswer(
              result?.status === "ok" ? result.value.text : "",
              result?.status === "ok" ? result.value.links : [],
              d.brand,
              d.hostname,
            ),
          };
          answers = answers.filter((a) => a.engine !== engine || a.promptId !== p.id);
          answers.push(answer);
          yield* persistRun({ ...r, answers });
          yield* Effect.sleep(`${2000 + (yield* Random.nextIntBetween(0, 3000))} millis`);
        }
      for (const finding of trackingFindings(answers, previous?.answers ?? []))
        yield* issues.upsert(c.projectId, finding).pipe(Effect.ignoreCause({ log: true }));
      yield* persistRun({ ...r, answers, status: "complete" });
    }, Effect.mapError(failure));
    const startRun = Effect.fn("Tracking.startRun")(function* (projectId: string) {
      if (active.has(projectId)) return active.get(projectId)!;
      const s = yield* snapshot();
      const c = s.configs.find((c) => c.projectId === projectId);
      if (s.usage.used > 20)
        return yield* new TrackingFailure({
          message: "Choose up to 20 enabled prompts for this computer.",
        });
      if (!c || !s.usage.domains.some((d) => d.projectId === projectId))
        return yield* new TrackingFailure({
          message: "Set up local tracking for this domain first.",
        });
      const day = scheduleDays(DateTime.toDate(yield* DateTime.now), c.time, undefined).day;
      const old = s.runs.find(
        (r) => r.projectId === projectId && r.day === day && r.status !== "missed",
      );
      if (
        old?.status === "complete" &&
        c.engines.every((engine) =>
          c.prompts
            .filter((p) => p.enabled)
            .every((p) =>
              old.answers.some(
                (a) =>
                  a.engine === engine &&
                  a.promptId === p.id &&
                  a.prompt === p.text &&
                  a.status === "answered",
              ),
            ),
        )
      )
        return old.id;
      const r: TrackingRun = {
        id: old?.id ?? (yield* random.uuidV4()),
        projectId,
        day,
        status: "running",
        total: c.prompts.filter((p) => p.enabled).length * c.engines.length,
        answers: (old?.answers ?? []).filter(
          (a) =>
            c.engines.includes(a.engine) &&
            c.prompts.some((p) => p.enabled && p.id === a.promptId && p.text === a.prompt),
        ),
      };
      active.set(projectId, r.id);
      yield* persistRun(r).pipe(Effect.onError(() => Effect.sync(() => active.delete(projectId))));
      const fiber = yield* lock
        .withPermits(1)(execute(c, r))
        .pipe(
          Effect.onError(() =>
            Effect.gen(function* () {
              const latest = (yield* runs()).find((run) => run.id === r.id) ?? r;
              yield* persistRun({ ...latest, status: "interrupted" });
            }).pipe(Effect.ignoreCause()),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              active.delete(projectId);
              runningFibers.delete(projectId);
            }),
          ),
          Effect.forkIn(scope),
        );
      runningFibers.set(projectId, fiber);
      return r.id;
    }, Effect.mapError(failure));
    const runNow = Effect.fn("Tracking.runNow")((projectId: string) =>
      startLock.withPermits(1)(startRun(projectId)),
    );
    const stopNow = Effect.fn("Tracking.stopNow")(function* (projectId: string) {
      const fiber = runningFibers.get(projectId);
      if (fiber) yield* Fiber.interrupt(fiber);
      const latest = (yield* runs()).find(
        (r) => r.projectId === projectId && r.status !== "missed",
      );
      if (!latest) return yield* new TrackingFailure({ message: "No check to stop." });
      if (latest.status !== "complete") yield* persistRun({ ...latest, status: "stopped" });
      return latest.id;
    }, Effect.mapError(failure));
    const tick = Effect.gen(function* () {
      const s = yield* snapshot();
      yield* syncUsage();
      for (const c of s.configs) {
        if (!s.usage.domains.some((d) => d.projectId === c.projectId)) continue;
        const latest = s.runs.find((r) => r.projectId === c.projectId);
        const [start] = yield* sql<{
          configured_day: string;
        }>`SELECT configured_day FROM amicited_tracking_config WHERE project_id = ${c.projectId}`;
        const days = scheduleDays(
          DateTime.toDate(yield* DateTime.now),
          c.time,
          latest?.day,
          start?.configured_day,
        );
        for (const day of days.missed)
          yield* persistRun({
            id: `missed:${c.projectId}:${day}`,
            projectId: c.projectId,
            day,
            status: "missed",
            total: 0,
            answers: [],
          });
        const reconnect =
          latest?.day === days.day &&
          latest.answers.some(
            (a) =>
              a.status === "needs_sign_in" &&
              connections.engine
                .snapshot()
                .connections.some(
                  (connection) =>
                    connection.id === (a.engine === "google_overviews" ? "google" : a.engine) &&
                    connection.status === "connected",
                ),
          );
        const interrupted =
          latest?.day === days.day &&
          (latest.status === "running" || latest.status === "interrupted") &&
          !active.has(c.projectId);
        if (days.due || reconnect || interrupted) yield* runNow(c.projectId);
      }
    }).pipe(Effect.mapError(failure));

    return {
      snapshot,
      save,
      runNow,
      stopNow,
      tick,
      suggest: Effect.fn("Tracking.suggest")(function* (id: string, category: string) {
        const d = (yield* metadata()).domains.find((d) => d.projectId === id);
        if (!d) return yield* new TrackingFailure({ message: "Domain not found." });
        return suggestPrompts(d.brand, category, d.hostname);
      }),
      subscribe: () =>
        Stream.unwrap(
          Effect.gen(function* () {
            const subscription = yield* PubSub.subscribe(changes);
            return Stream.fromSubscription(subscription).pipe(
              Stream.prepend([undefined]),
              Stream.mapEffect(() => snapshot()),
            );
          }),
        ),
    };
  }),
);

export const layerWorker = Layer.effectDiscard(
  Effect.gen(function* () {
    const tracking = yield* Tracking;
    yield* tracking.tick.pipe(
      Effect.ignoreCause({ log: true }),
      Effect.repeat(Schedule.spaced("1 minute")),
      Effect.forkScoped,
    );
  }),
);

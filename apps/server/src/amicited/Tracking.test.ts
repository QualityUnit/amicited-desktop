import googleOverviews from "./trackingAdapters/googleOverviews.ts";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { createModelSelection } from "@t3tools/shared/model";
import { vi, expect } from "vite-plus/test";
import * as Settings from "../serverSettings.ts";
import * as Registry from "../provider/ProviderInstanceRegistry.ts";
import { ProviderInstanceId, type ServerSettings } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  TrackingRun,
  engineConnection,
  type TrackingEngine,
} from "@amicited/cloud-client/tracking";
import * as DateTime from "effect/DateTime";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";
import * as SqlClient from "effect/sql/SqlClient";
import { CloudClient } from "@amicited/cloud-client";
import { AccountConnections } from "@amicited/cloud-client/account";
import { DomainConnections } from "@amicited/cloud-client/domains";
import { BrowserConnections } from "@amicited/cloud-client/connections";
import {
  type TrackingConfig,
  parseAnswer,
  scheduleDays,
  trackingFindings,
} from "@amicited/cloud-client/tracking";
import type { Issue } from "@amicited/cloud-client/issues";
import { evidencePage } from "./EvidenceFixtures.ts";
import type { Page } from "playwright-core";
import * as Sqlite from "../persistence/Sqlite.ts";
import { AmicitedCloud } from "./Cloud.ts";
import { runConnection } from "./ConnectionSessionAdapter.ts";
import { Connections } from "./Connections.ts";
import { AmicitedIssues } from "./Issues.ts";
import * as Tracking from "./Tracking.ts";
const encodeTestRun = Schema.encodeEffect(Schema.fromJsonString(TrackingRun));
const fixture = (recorded = false, blockAnswer = false, generation = false) => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const secrets = {
    read: async () => JSON.stringify({ apiKey: "saved-test-key" }),
    write: async () => {},
    clear: async () => {},
  };
  const cloud = new CloudClient({ secrets, openExternal: async () => {} });
  cloud.domains = new DomainConnections({
    read: async () =>
      ["one", "two", "paid"].map((id) => ({
        projectId: id,
        hostname: `${id}.example`,
        brand: id,
        workspaceId: id,
        connectionRef: id,
      })),
    write: async () => {},
    secrets: () => secrets,
    legacy: secrets,
    client: () => cloud,
    changed: () => {},
  });
  cloud.account = new AccountConnections({
    read: async () => ({
      workspaces: ["one", "two", "paid"].map((id) => ({
        id,
        name: id,
        email: "test@example.com",
        plan: id === "paid" ? "Pro" : "Free",
        access: id === "paid" ? ("full" as const) : ("free" as const),
        sessionEnded: false,
        userName: "Test",
        attentionCount: 0,
        websites: [],
      })),
      currentWorkspaceId: "one",
    }),
    write: async () => {},
    secrets: () => secrets,
    client: () =>
      ({ status: async () => ({ state: "error", kind: "network" }) }) as unknown as CloudClient,
    openExternal: async () => {},
    userinfo: async () => ({ email: "test@example.com", name: "Test" }),
    domains: () => cloud.domains,
  });
  const page = {
    goto: async () => {},
    close: async () => {},
    locator: (selector: string) => ({
      first: () => ({
        isVisible: async () =>
          selector.includes("Log in") || selector.includes("login") || selector.includes("Sign in"),
      }),
    }),
  } as unknown as Page;
  const engine = new BrowserConnections<Page>({
    open: async () => {
      const selected = recorded
        ? evidencePage(
            0,
            blockAnswer
              ? async () => {
                  entered.resolve();
                  await release.promise;
                }
              : undefined,
          )
        : page;
      return {
        page: selected,
        close: async () => {
          await selected.close();
          if (blockAnswer) release.reject(new Error("Page closed"));
          closed.resolve();
        },
      };
    },
    clearCookies: async () => {},
  });
  const findings: Issue[] = [];
  const deps = Layer.mergeAll(
    Layer.mock(Settings.ServerSettingsService)({
      getSettings: Effect.succeed({
        defaultModelSelection: createModelSelection(ProviderInstanceId.make("assistant"), "test"),
      } as ServerSettings),
    }),
    Layer.mock(Registry.ProviderInstanceRegistry)({
      getInstance: () =>
        Effect.succeed(
          generation
            ? ({
                textGeneration: {
                  generateMarketingText: ({ prompt }: { prompt: string }) =>
                    Effect.succeed({
                      text: prompt.includes("three concrete")
                        ? '["Fix A","Fix B","Fix C"]'
                        : '["Buyer question one", "Buyer question two"]',
                    }),
                },
              } as unknown as import("@t3tools/provider-core/server/driver").ProviderInstance)
            : undefined,
        ),
    }),
    Sqlite.layerMemory,
    NodeCrypto.layer,
    Layer.succeed(AmicitedCloud, cloud),
    Layer.mock(Connections)({
      engine,
      run: (action) => runConnection(engine, action),
    }),
    Layer.mock(AmicitedIssues)({
      list: () => Effect.succeed([]),
      snapshot: () => Effect.succeed({ issues: findings, audits: [] }),
      update: (input) =>
        Effect.sync(() => {
          const i = findings.findIndex((i) => i.id === input.id);
          const updated = { ...findings[i]!, status: input.status ?? findings[i]!.status };
          findings[i] = updated;
          return updated;
        }),
      upsert: (_id, input) =>
        Effect.sync(() => {
          const result: Issue = {
            ...input,
            id: `issue:${input.fingerprint}`,
            projectId: "one",
            status: "open",
            resolution: null,
            threadId: null,
            firstSeenAt: "",
            lastSeenAt: "",
            resolvedAt: null,
            updatedAt: "",
            effort: input.effort ?? null,
          };
          findings.push(result);
          return result;
        }),
    }),
  );
  return {
    entered: entered.promise,
    closed: closed.promise,
    setRecorded: (value: boolean) => {
      recorded = value;
    },
    cloud,
    findings,
    engine,
    layer: Tracking.layer.pipe(Layer.provideMerge(deps)),
  };
};
const config = (projectId: string, count: number, country: string): TrackingConfig => ({
  projectId,
  country,
  time: "09:00",
  engines: [],
  prompts: Array.from({ length: count }, (_, i) => ({
    id: `${projectId}:${i}`,
    text: `Question ${i}`,
    enabled: true,
    created: "2026-11-17",
  })),
});
it.effect(
  "enforces the computer budget across workspaces atomically and excludes paid domains",
  () => {
    const f = fixture();
    return Effect.gen(function* () {
      const t = yield* Tracking.Tracking;
      const country = (yield* t.snapshot()).country;
      assert.deepEqual(
        yield* t.save({ ...config("one", 12, country), threadId: "first-check-chat" }),
        { status: "saved" },
      );
      assert.equal(
        (yield* t.snapshot()).configs.find((c) => c.projectId === "one")?.threadId,
        "first-check-chat",
      );
      assert.deepEqual(yield* t.save(config("two", 8, country)), { status: "saved" });
      const limited = yield* t.save(config("two", 9, country));
      assert.equal(limited.status, "limit_reached");
      if (limited.status === "limit_reached") assert.equal(limited.usage.used, 20);
      assert.equal((yield* t.snapshot()).usage.used, 20);
      assert.deepEqual(yield* t.save(config("paid", 100, country)), { status: "cloud" });
      assert.equal((yield* t.snapshot()).usage.domains.length, 2);
      assert.deepEqual(yield* t.save(config("two", 9, country), "one:0"), { status: "saved" });
      assert.equal((yield* t.snapshot()).usage.used, 20);
      assert.equal(f.engine.snapshot().usage?.used, 20);
      yield* t.save(config("one", 0, country));
      yield* t.save(config("two", 0, country));
      const concurrent = yield* Effect.all(
        [t.save(config("one", 12, country)), t.save(config("two", 12, country))],
        { concurrency: "unbounded" },
      );
      assert.equal(concurrent.filter((r) => r.status === "saved").length, 1);
      assert.equal((yield* t.snapshot()).usage.used, 12);
      const sql = yield* SqlClient.SqlClient;
      assert.equal((yield* sql`SELECT migration_id FROM amicited_tracking_migrations`).length, 1);
      assert.equal(
        (yield* sql`SELECT name FROM sqlite_master WHERE name = 'amicited_migrations'`).length,
        0,
      );
    }).pipe(Effect.provide(f.layer));
  },
);
it.effect("records missed days using the Effect clock and runs today's due check", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const t = yield* Tracking.Tracking;
    const country = (yield* t.snapshot()).country;
    yield* t.save(config("one", 1, country));
    yield* TestClock.adjust("1 day");
    yield* t.tick;
    assert.isTrue((yield* t.snapshot()).runs.some((r) => r.status === "missed"));
    const id = yield* t.runNow("one");
    const completed = yield* t.subscribe().pipe(
      Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
      Stream.take(1),
      Stream.runDrain,
      Effect.forkChild,
    );
    yield* Fiber.join(completed);
    yield* TestClock.adjust("3 days");
    yield* t.tick;
    const s = yield* t.snapshot();
    assert.isTrue(s.runs.some((r) => r.status === "missed"));
    assert.equal(s.usage.used, 1);
  }).pipe(Effect.provide(f.layer));
});
it.effect("records sign-in failures without aborting the run and creates connection Issues", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const t = yield* Tracking.Tracking;
    const country = (yield* t.snapshot()).country;
    yield* t.save({
      ...config("one", 1, country),
      engines: ["chatgpt", "google", "google_overviews"],
    });
    const id = yield* t.runNow("one");
    const done = yield* t.subscribe().pipe(
      Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
      Stream.take(1),
      Stream.runDrain,
      Effect.forkChild,
    );
    yield* TestClock.adjust("15 seconds");
    yield* Fiber.join(done);
    assert.equal(f.findings.length, 2);
    const r = (yield* t.snapshot()).runs.find((r) => r.id === id)!;
    assert.deepEqual(
      r.answers.map((a) => a.engine),
      ["chatgpt", "google"],
    );
    assert.isTrue(r.answers.every((a) => a.status === "needs_sign_in"));
    assert.notEqual(
      f.engine.snapshot().connections.find((c) => c.id === "chatgpt")?.status,
      "connected",
    );
    f.setRecorded(true);
    yield* t.runNow("one");
    const recovered = yield* t.subscribe().pipe(
      Stream.filter((s) => s.runs.some((r) => r.id === id && r.outcome === "ok")),
      Stream.take(1),
      Stream.runDrain,
      Effect.forkChild,
    );
    yield* TestClock.adjust("30 seconds");
    yield* Fiber.join(recovered);
    assert.isTrue(f.findings.filter((i) => i.kind === "connect").every((i) => i.status === "done"));
  }).pipe(Effect.provide(f.layer));
});
it("extracts mentions, ranked competitors and citations from a recorded answer", () => {
  const text =
    "1. **Mixpanel**: Strong funnels.\n2. **Northwind Analytics**: Simple setup at northwind.io.\n3. **Amplitude**: Retention reports.";
  const parsed = parseAnswer(
    text,
    ["https://northwind.io/pricing"],
    "Northwind Analytics",
    "northwind.io",
  );
  assert.equal(parsed.position, 2);
  assert.isTrue(parsed.mentioned);
  assert.deepEqual(parsed.competitorsMentioned, ["Mixpanel", "Amplitude"]);
  assert.deepEqual(parsed.citations, ["https://northwind.io/pricing"]);
  assert.isFalse(
    parseAnswer("Try NotNorthwindAnalytics instead", [], "NorthwindAnalytics", "northwind.io")
      .mentioned,
  );
  const answer = {
    ...parsed,
    engine: "chatgpt" as const,
    promptId: "p",
    prompt: "Question",
    status: "answered" as const,
  };
  const dropped = { ...answer, mentioned: false };
  assert.equal(trackingFindings([dropped], [answer])[0]?.priority, "high");
  assert.equal(trackingFindings([{ ...answer, status: "needs_sign_in" }], [])[0]?.kind, "connect");
  assert.isFalse(
    scheduleDays(DateTime.toDate(DateTime.makeUnsafe("2026-11-17T00:00:00")), "09:00", "2026-11-17")
      .due,
  );
});

it.effect("stops a check without the scheduler restarting it, and permits a manual restart", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const tracking = yield* Tracking.Tracking;
    const country = (yield* tracking.snapshot()).country;
    yield* tracking.save({ ...config("one", 1, country), engines: ["google", "google_overviews"] });
    const id = yield* tracking.runNow("one");
    yield* tracking.stopNow("one");
    assert.equal((yield* tracking.snapshot()).runs.find((r) => r.id === id)?.status, "stopped");
    yield* tracking.tick;
    assert.equal((yield* tracking.snapshot()).runs.find((r) => r.id === id)?.status, "stopped");
    assert.equal(yield* tracking.runNow("one"), id);
  }).pipe(Effect.provide(f.layer));
});

it.effect(
  "collects recorded answers, preserves consumption after replacement, and binds a thread to its original run",
  () => {
    const f = fixture(true);
    f.findings.push({
      id: "legacy",
      projectId: "one",
      fingerprint: "tracking:chatgpt:one:0",
      kind: "fix",
      title: "Old per-question finding",
      body: "Question",
      report: "AI visibility",
      priority: "medium",
      effort: "small",
      status: "open",
      resolution: null,
      threadId: null,
      firstSeenAt: "",
      lastSeenAt: "",
      resolvedAt: null,
      updatedAt: "",
    });
    return Effect.gen(function* () {
      const t = yield* Tracking.Tracking;
      const country = (yield* t.snapshot()).country;
      yield* t.save({ ...config("one", 1, country), engines: ["chatgpt"] });
      const id = yield* t.runNow("one", "first-check");
      const done = yield* t.subscribe().pipe(
        Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
        Stream.take(1),
        Stream.runDrain,
        Effect.forkChild,
      );
      yield* TestClock.adjust("10 seconds");
      yield* Fiber.join(done);
      assert.equal((yield* t.detail(id))?.outcome, "ok");
      assert.equal(f.findings.find((i) => i.id === "legacy")?.status, "done");
      assert.isTrue((yield* t.detail(id))!.answers[0]!.excerpt.length > 0);
      assert.equal((yield* t.snapshot()).runs[0]!.answers[0]!.excerpt, "");
      assert.equal((yield* t.snapshot()).usage.consumed, 1);
      yield* t.save({
        ...config("one", 1, country),
        prompts: [
          { id: "replacement", text: "Different question", enabled: true, created: "today" },
        ],
        engines: ["chatgpt"],
      });
      const next = yield* t.runNow("one");
      assert.notEqual(next, id);
      yield* t.stopNow("one");
      assert.equal((yield* t.detail("first-check"))?.id, id);
      assert.isAtLeast((yield* t.snapshot()).usage.consumed!, 1);
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT OR IGNORE INTO amicited_tracking_ledger SELECT ${(yield* t.detail(id))!.day}, 'consumed ' || value FROM json_each('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]')`;
      yield* t.save({
        ...config("two", 1, country),
        prompts: [{ id: "new", text: "Unasked question", enabled: true, created: "today" }],
        engines: ["chatgpt"],
      });
      const limited = yield* t.runNow("two");
      const exhausted = yield* t.subscribe().pipe(
        Stream.filter((s) => s.runs.some((r) => r.id === limited && r.status === "complete")),
        Stream.take(1),
        Stream.runDrain,
        Effect.forkChild,
      );
      yield* TestClock.adjust("10 seconds");
      yield* Fiber.join(exhausted);
      assert.equal(
        (yield* t.detail(limited))?.answers.filter((a) => a.status === "answered").length,
        0,
      );
      assert.equal((yield* t.detail(limited))?.outcome, "failed");
      assert.equal((yield* t.detail(limited))?.answers[0]?.status, "budget_exhausted");
      const restored = yield* Effect.gen(function* () {
        return yield* (yield* Tracking.Tracking).snapshot();
      }).pipe(Effect.provide(Layer.fresh(Tracking.layer)));
      assert.isAtLeast(restored.usage.consumed!, 20);
    }).pipe(Effect.provide(f.layer));
  },
);
it.effect("excludes removed and ended workspaces from capacity and execution", () => {
  const f = fixture();
  return Effect.gen(function* () {
    const t = yield* Tracking.Tracking;
    const country = (yield* t.snapshot()).country;
    yield* t.save(config("one", 20, country));
    f.cloud.account = {
      status: async () => ({ workspaces: [{ id: "one", sessionEnded: true, access: "free" }] }),
    } as unknown as AccountConnections;
    assert.equal((yield* t.snapshot()).usage.used, 0);
    assert.isTrue((yield* Effect.exit(t.runNow("one")))._tag === "Failure");
    f.cloud.account = { status: async () => ({ workspaces: [] }) } as unknown as AccountConnections;
    assert.equal((yield* t.snapshot()).usage.used, 0);
    yield* t.tick;
    assert.equal((yield* t.snapshot()).runs.length, 0);
  }).pipe(Effect.provide(f.layer));
});

it.effect("Stop cancels answer collection and closes its page before returning", () => {
  const f = fixture(true, true);
  return Effect.gen(function* () {
    const t = yield* Tracking.Tracking;
    const country = (yield* t.snapshot()).country;
    yield* t.save({ ...config("one", 1, country), engines: ["chatgpt"] });
    const id = yield* t.runNow("one");
    yield* Effect.promise(() => f.entered);
    yield* t.stopNow("one");
    yield* Effect.promise(() => f.closed);
    assert.equal((yield* t.detail(id))?.status, "stopped");
    assert.equal((yield* t.detail(id))?.answers.length, 0);
  }).pipe(Effect.provide(f.layer));
});

it.effect("groups engine findings and maps every Google engine to its connection", () => {
  return Effect.sync(() => {
    assert.deepEqual(
      ["gemini", "google", "google_overviews"].map((e) => engineConnection(e as TrackingEngine)),
      ["google", "google", "google"],
    );
    const answer = {
      ...parseAnswer("1. Acme", [], "Northwind", "northwind.io"),
      engine: "chatgpt" as const,
      promptId: "one",
      prompt: "Question one",
      status: "answered" as const,
    };
    const grouped = trackingFindings(
      [answer, { ...answer, promptId: "two", prompt: "Question two" }],
      [],
    );
    assert.equal(grouped.length, 1);
    assert.include(grouped[0]!.body, "2 affected prompts");
    assert.include(grouped[0]!.body, "Question two");
  });
});

it.effect("reserves on the current local day across midnight and persists dismissals", () => {
  const f = fixture(true);
  const before = DateTime.toDate(DateTime.makeUnsafe("2026-11-17T23:59:59Z"));
  before.setMinutes(before.getMinutes() + before.getTimezoneOffset());
  return Effect.gen(function* () {
    const t = yield* Tracking.Tracking;
    yield* TestClock.setTime(before.getTime());
    const country = (yield* t.snapshot()).country;
    yield* t.save({ ...config("one", 2, country), engines: ["chatgpt"] });
    const id = yield* t.runNow("one");
    yield* t.subscribe().pipe(
      Stream.filter((s) => s.runs.some((r) => r.id === id && r.answers.length === 1)),
      Stream.take(1),
      Stream.runDrain,
    );
    yield* TestClock.adjust("10 seconds");
    yield* t.subscribe().pipe(
      Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
      Stream.take(1),
      Stream.runDrain,
    );
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{
      day: string;
      count: number;
    }>`SELECT day, COUNT(*) AS count FROM amicited_tracking_ledger GROUP BY day ORDER BY day`;
    assert.deepEqual(
      rows.map((r) => r.count),
      [1, 1],
    );
    assert.equal((yield* t.snapshot()).usage.askedToday, 1);
    yield* t.dismiss("workspace:two", "later");
    yield* t.dismiss("connection:linkedin:thread", "dismiss");
    yield* TestClock.adjust("1 day");
    assert.deepEqual((yield* t.snapshot()).dismissals, ["connection:linkedin:thread"]);
    yield* t.dismiss("connection:linkedin:thread", "restore");
    assert.deepEqual((yield* t.snapshot()).dismissals, []);
  }).pipe(Effect.provide(f.layer));
});

it.effect(
  "resumes a persisted incomplete run after restart and manually recovers a partial run",
  () => {
    const f = fixture();
    return Effect.gen(function* () {
      const t = yield* Tracking.Tracking;
      const country = (yield* t.snapshot()).country;
      const c = { ...config("one", 2, country), engines: ["gemini" as const] };
      yield* t.save(c);
      const id = yield* t.runNow("one");
      yield* TestClock.adjust("10 seconds");
      yield* t.subscribe().pipe(
        Stream.filter((s) => s.runs.some((r) => r.status === "complete")),
        Stream.take(1),
        Stream.runDrain,
      );
      assert.equal((yield* t.detail(id))?.outcome, "failed");
      const sql = yield* SqlClient.SqlClient;
      const partial = (yield* t.detail(id))!;
      const preserved = {
        ...partial.answers[0]!,
        status: "answered" as const,
        excerpt: "Original saved answer",
      };
      const partialValue = yield* encodeTestRun({
        ...partial,
        outcome: "partial",
        answers: [preserved],
      });
      yield* sql`UPDATE amicited_tracking_runs SET value=${partialValue} WHERE id=${id}`;
      f.setRecorded(true);
      assert.equal(yield* t.checkMissing(id), id);
      yield* TestClock.adjust("10 seconds");
      yield* t.subscribe().pipe(
        Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
        Stream.take(1),
        Stream.runDrain,
      );
      assert.equal((yield* t.detail(id))?.outcome, "ok");
      assert.equal(
        (yield* t.detail(id))?.answers.find((a) => a.promptId === preserved.promptId)?.excerpt,
        "Original saved answer",
      );
      const old = { ...(yield* t.detail(id))!, answers: [] };
      const value = yield* encodeTestRun({ ...old, status: "interrupted" });
      yield* sql`UPDATE amicited_tracking_runs SET value=${value}, status='interrupted' WHERE id=${id}`;
      f.setRecorded(true);
      yield* Effect.gen(function* () {
        const restored = yield* Tracking.Tracking;
        yield* restored.tick;
        yield* TestClock.adjust("10 seconds");
        yield* restored.subscribe().pipe(
          Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
          Stream.take(1),
          Stream.runDrain,
        );
        assert.equal((yield* restored.detail(id))?.outcome, "ok");
        assert.deepEqual((yield* restored.detail(id))?.engines, ["gemini"]);
        assert.equal(yield* restored.checkMissing(id), id);
        assert.equal((yield* restored.detail(id))?.fixesSource, "template");
      }).pipe(Effect.provide(Layer.fresh(Tracking.layer)));
    }).pipe(Effect.provide(f.layer));
  },
);

it.effect("generates website suggestions and persists assistant-written fixes", () => {
  const f = fixture(true, false, true);
  return Effect.gen(function* () {
    using _fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("<html>Analytics for small teams</html>"));
    const t = yield* Tracking.Tracking;
    assert.deepEqual(yield* t.suggest("one", "analytics"), [
      "Buyer question one",
      "Buyer question two",
    ]);
    const country = (yield* t.snapshot()).country;
    yield* t.save({ ...config("one", 1, country), engines: ["chatgpt"] });
    const id = yield* t.runNow("one");
    yield* TestClock.adjust("10 seconds");
    yield* t.subscribe().pipe(
      Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
      Stream.take(1),
      Stream.runDrain,
    );
    assert.deepEqual((yield* t.detail(id))?.fixes, ["Fix A", "Fix B", "Fix C"]);
    assert.equal((yield* t.detail(id))?.fixesSource, "assistant");
  }).pipe(Effect.provide(f.layer));
});

it("records missing AI Overviews as answered without swallowing navigation failures", async () => {
  const timeout = new Error("No overview");
  timeout.name = "TimeoutError";
  const page = evidencePage(0);
  const locator = page.locator.bind(page);
  page.locator = ((selector: string) => {
    const result = locator(selector);
    if (selector.includes("AIOverview"))
      result.last = () =>
        ({
          ...result,
          waitFor: async () => {
            throw timeout;
          },
        }) as typeof result;
    return result;
  }) as typeof page.locator;
  const result = await googleOverviews(page, "What is best?");
  assert.equal(result.text, "No AI Overview shown");
  assert.isFalse(parseAnswer(result.text, [], "Northwind", "northwind.io").mentioned);
  page.goto = async () => {
    throw new Error("Navigation failed");
  };
  await expect(googleOverviews(page, "What is best?")).rejects.toThrow("Navigation failed");
});

it.effect(
  "retries Google questions once per reconnect even if probes keep claiming connected",
  () => {
    const f = fixture();
    return Effect.gen(function* () {
      const t = yield* Tracking.Tracking;
      const country = (yield* t.snapshot()).country;
      yield* t.save({ ...config("one", 1, country), engines: ["gemini"] });
      const id = yield* t.runNow("one");
      yield* TestClock.adjust("10 seconds");
      yield* t.subscribe().pipe(
        Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
        Stream.take(1),
        Stream.runDrain,
      );
      const connected = (stamp: string) =>
        f.engine.restore([
          {
            id: "google",
            status: "connected",
            lastChecked: stamp,
            reconnectedAt: stamp,
            lastUsed: null,
            usedBy: [],
            signingIn: false,
          },
        ]);
      connected("reconnect-one");
      yield* t.tick;
      assert.equal((yield* t.detail(id))?.status, "running");
      yield* TestClock.adjust("10 seconds");
      yield* t.subscribe().pipe(
        Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
        Stream.take(1),
        Stream.runDrain,
      );
      connected("reconnect-one");
      yield* t.tick;
      assert.equal((yield* t.detail(id))?.status, "complete");
      connected("reconnect-two");
      yield* t.tick;
      assert.equal((yield* t.detail(id))?.status, "running");
      yield* t.stopNow("one");
    }).pipe(Effect.provide(f.layer));
  },
);

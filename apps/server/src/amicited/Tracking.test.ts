import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
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
import type { Page } from "playwright-core";
import * as Sqlite from "../persistence/Sqlite.ts";
import { AmicitedCloud } from "./Cloud.ts";
import { Connections } from "./Connections.ts";
import { AmicitedIssues } from "./Issues.ts";
import * as Tracking from "./Tracking.ts";
const fixture = () => {
  const secrets = { read: async () => undefined, write: async () => {}, clear: async () => {} };
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
    client: () => cloud,
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
    open: async () => ({ page, close: async () => {} }),
    clearCookies: async () => {},
  });
  const findings: unknown[] = [];
  const deps = Layer.mergeAll(
    Sqlite.layerMemory,
    NodeCrypto.layer,
    Layer.succeed(AmicitedCloud, cloud),
    Layer.mock(Connections)({ engine, run: (action) => Effect.promise(() => action(engine)) }),
    Layer.mock(AmicitedIssues)({
      upsert: (_id, input) =>
        Effect.sync(() => {
          findings.push(input);
          return {
            ...input,
            id: "issue",
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
        }),
    }),
  );
  return { findings, engine, layer: Tracking.layer.pipe(Layer.provideMerge(deps)) };
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
      assert.deepEqual(yield* t.save(config("one", 12, country)), { status: "saved" });
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
    yield* t.save({ ...config("one", 1, country), engines: ["chatgpt"] });
    const id = yield* t.runNow("one");
    const done = yield* t.subscribe().pipe(
      Stream.filter((s) => s.runs.some((r) => r.id === id && r.status === "complete")),
      Stream.take(1),
      Stream.runDrain,
      Effect.forkChild,
    );
    yield* TestClock.adjust("5 seconds");
    yield* Fiber.join(done);
    assert.equal(f.findings.length, 1);
    const r = (yield* t.snapshot()).runs.find((r) => r.id === id)!;
    assert.equal(r.answers[0]?.status, "needs_sign_in");
    assert.notEqual(
      f.engine.snapshot().connections.find((c) => c.id === "chatgpt")?.status,
      "connected",
    );
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

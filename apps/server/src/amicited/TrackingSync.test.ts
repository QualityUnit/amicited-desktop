// @effect-diagnostics nodeBuiltinImport:off - the fake FlowHunt is a real HTTP server the SDK client connects to.
import * as NodeHttp from "node:http";
import { CloudClient } from "@amicited/cloud-client";
import type { AccountConnections } from "@amicited/cloud-client/account";
import { DomainConnections, type Domain } from "@amicited/cloud-client/domains";
import type { LocalResult } from "@amicited/cloud-client/localResults";
import { trackingAnswer, type TrackingRun } from "@amicited/cloud-client/tracking";
import { answeredResult, unansweredResult } from "@amicited/visibility/result";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import * as Sqlite from "../persistence/Sqlite.ts";
import { makeTrackingSync } from "./TrackingSync.ts";

type Submission = {
  domain_id: string;
  collector: string;
  day_pass?: string;
  results: LocalResult[];
};
type Reply = (submission: Submission) => { error: string } | { outcomes: object[] };

/** A FlowHunt MCP endpoint: uploads get `reply`, day passes list `free.com` as `domain-2`. */
const fakeFlowHunt = Effect.acquireRelease(
  Effect.promise(async () => {
    const uploads: Submission[] = [];
    const tools: string[] = [];
    let reply: Reply = (s) => ({ outcomes: s.results.map(() => ({ outcome: "created" })) });
    let passRefusals = 0;
    const server = NodeHttp.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (req.method !== "POST") return void res.writeHead(405).end();
      const rpc = JSON.parse(Buffer.concat(chunks).toString());
      if (rpc.id === undefined) return void res.writeHead(202).end();
      const text = (value: unknown) => ({
        content: [{ type: "text", text: JSON.stringify(value) }],
      });
      const refuse = (message: string) => ({
        isError: true,
        content: [{ type: "text", text: message }],
      });
      let result: unknown = {};
      if (rpc.method === "initialize")
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "flowhunt", version: "1" },
        };
      if (rpc.method === "tools/call") {
        const { name, arguments: args } = rpc.params;
        tools.push(name);
        if (name === "issue_local_results_pass")
          result = text({
            day_pass: `pass-${args.day}`,
            day: args.day,
            prompts_per_day: 20,
            prompts_used: 0,
            domains: [{ domain_id: "domain-2", domain_name: "free.com", brand_name: "Free" }],
          });
        else if (name === "submit_free_local_results" && passRefusals > 0) {
          passRefusals--;
          result = refuse("The day pass is invalid or expired. Ask for a new one.");
        } else {
          const submission = args.submission as Submission;
          uploads.push(submission);
          const answer = reply(submission);
          result =
            "error" in answer
              ? refuse(answer.error)
              : text({ results: answer.outcomes.map((o, index) => ({ index, ...o })) });
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const secrets = {
      read: async () => JSON.stringify({ apiKey: "test-key" }),
      write: async () => {},
      clear: async () => {},
    };
    const client = new CloudClient({
      endpoint: `http://127.0.0.1:${address.port}/mcp/amicited/workspace-1`,
      secrets,
      openExternal: async () => {},
    });
    const cloud = new CloudClient({ secrets, openExternal: async () => {} });
    let rows: Domain[] = [
      {
        projectId: "site",
        hostname: "acme.com",
        brand: "Acme",
        connectionRef: "site",
        workspaceId: "workspace-1",
        domainId: "domain-1",
      },
      {
        projectId: "free",
        hostname: "free.com",
        brand: "Free",
        connectionRef: "free",
        workspaceId: "workspace-1",
      },
      { projectId: "local", hostname: "local.com", brand: "Local", connectionRef: "local" },
    ];
    cloud.domains = new DomainConnections({
      read: async () => rows,
      write: async (next) => {
        rows = next;
      },
      secrets: () => secrets,
      legacy: secrets,
      client: () => client,
      changed: () => {},
    });
    cloud.account = { client: () => client } as unknown as AccountConnections;
    return {
      cloud,
      uploads,
      tools,
      reply: (next: Reply) => {
        reply = next;
      },
      refusePass: () => {
        passRefusals++;
      },
      close: async () => {
        await client.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  }),
  (fake) => Effect.promise(fake.close),
);

const capturedAt = "2026-11-19T07:00:00.000Z";
const answered = (
  prompt: string,
  engine: "perplexity" | "chatgpt" | "google" = "perplexity",
  at = capturedAt,
) =>
  trackingAnswer(
    prompt,
    answeredResult(
      { engine, prompt, capturedAt: at, country: "US" },
      { text: "Acme is great", links: [] },
      { brand: "Acme", domain: "acme.com" },
    ),
  );
const signedOut = (prompt: string) =>
  trackingAnswer(
    prompt,
    unansweredResult({ engine: "chatgpt", prompt, capturedAt, country: "US" }, "logged_out", "x"),
  );
const run = (projectId: string, answers: TrackingRun["answers"]): TrackingRun => ({
  id: `${projectId}-run`,
  projectId,
  day: "2026-11-19",
  status: "complete",
  total: answers.length,
  answers,
});
const setup = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-11-19T08:00:00Z"));
  const fake = yield* fakeFlowHunt;
  return { fake, sync: yield* makeTrackingSync(fake.cloud) };
});
const engines = (s: Submission | undefined) => s?.results.map((r) => `${r.engine}:${r.status}`);

it.effect(
  "uploads each answer once, skips engines the cloud lacks, and resends a failed check once answered",
  () =>
    Effect.gen(function* () {
      const { fake, sync } = yield* setup;
      const first = run("site", [answered("a"), signedOut("a"), answered("a", "google")]);
      yield* sync.record(first);
      assert.isTrue(yield* sync.drain());
      assert.deepEqual(fake.uploads[0]?.domain_id, "domain-1");
      assert.deepEqual(engines(fake.uploads[0]), ["perplexity:answered", "chatgpt:logged_out"]);

      yield* sync.record(first);
      assert.isFalse(yield* sync.drain());
      assert.equal(fake.uploads.length, 1);
      const [state] = yield* sync.status();
      assert.deepEqual(
        { state: state?.state, pending: state?.pending, at: state?.lastSyncedAt },
        { state: "synced", pending: 0, at: "2026-11-19T08:00:00.000Z" },
      );

      yield* sync.record(run("site", [answered("a"), answered("a", "chatgpt")]));
      yield* sync.drain();
      assert.deepEqual(engines(fake.uploads[1]), ["chatgpt:answered"]);
      yield* sync.record(run("site", [signedOut("a")]));
      yield* sync.drain();
      assert.equal(fake.uploads.length, 2);
    }).pipe(Effect.provide(Sqlite.layerMemory)),
);

it.effect("retries conflicts with backoff and waits out retry_after", () =>
  Effect.gen(function* () {
    const { fake, sync } = yield* setup;
    fake.reply(() => ({
      outcomes: [
        { outcome: "rejected", error_code: "conflict" },
        { outcome: "retry_later", retry_after: 300 },
      ],
    }));
    yield* sync.record(run("site", [answered("a"), answered("b")]));
    yield* sync.drain();
    yield* sync.drain();
    assert.equal(fake.uploads.length, 1);
    fake.reply((s) => ({ outcomes: s.results.map(() => ({ outcome: "updated" })) }));
    yield* TestClock.adjust("1 minute");
    yield* sync.drain();
    assert.deepEqual(
      fake.uploads[1]?.results.map((r) => r.prompt),
      ["a"],
    );
    yield* TestClock.adjust("4 minutes");
    yield* sync.drain();
    assert.deepEqual(
      fake.uploads[2]?.results.map((r) => r.prompt),
      ["b"],
    );
    yield* TestClock.adjust("1 day");
    yield* sync.drain();
    assert.equal(fake.uploads.length, 3);
  }).pipe(Effect.provide(Sqlite.layerMemory)),
);

it.effect("stops on permanent refusals and pauses a domain the cloud refuses outright", () =>
  Effect.gen(function* () {
    const { fake, sync } = yield* setup;
    fake.reply(() => ({
      outcomes: [
        { outcome: "rejected", error_code: "prompt_limit_reached" },
        { outcome: "rejected", error_code: "conflict" },
        { outcome: "rejected", error_code: "too_old" },
      ],
    }));
    yield* sync.record(run("site", [answered("a"), signedOut("a"), answered("b")]));
    yield* sync.record(run("local", [answered("c")]));
    yield* sync.drain();
    yield* TestClock.adjust("1 day");
    yield* sync.drain();
    assert.equal(fake.uploads.length, 1);
    const status = yield* sync.status();
    assert.deepEqual(
      status.map((s) => [s.projectId, s.state, s.skipped]),
      [
        ["local", "not_linked", 0],
        ["site", "synced", 3],
      ],
    );

    fake.reply(() => ({ error: "User does not have permission to perform this action" }));
    yield* sync.record(run("site", [answered("d")]));
    yield* sync.drain();
    yield* TestClock.adjust("1 hour");
    yield* sync.drain();
    assert.equal(fake.uploads.length, 2);
    assert.equal(
      (yield* sync.status()).find((s) => s.projectId === "site")?.state,
      "no_edit_rights",
    );
    yield* TestClock.adjust("6 hours");
    yield* sync.drain();
    assert.equal(fake.uploads.length, 3);

    fake.reply((s) => ({ outcomes: s.results.map(() => ({ outcome: "created" })) }));
    yield* sync.record(run("site", [answered("e")]));
    yield* sync.drain();
    assert.deepEqual(
      fake.uploads[3]?.results.map((r) => r.prompt),
      ["d", "e"],
    );
  }).pipe(Effect.provide(Sqlite.layerMemory)),
);

it.effect("sends a refused batch one by one and drops only the answer refused alone", () =>
  Effect.gen(function* () {
    const { fake, sync } = yield* setup;
    fake.reply((s) =>
      s.results.some((r) => r.prompt === "bad")
        ? { error: "1 validation error for call[submit_local_results]" }
        : { outcomes: s.results.map(() => ({ outcome: "created" })) },
    );
    yield* sync.record(run("site", [answered("bad"), answered("good")]));
    yield* sync.drain();
    yield* TestClock.adjust("1 day");
    yield* sync.drain();
    assert.deepEqual(
      fake.uploads.map((u) => u.results.map((r) => r.prompt)),
      [["bad", "good"], ["bad"], ["good"]],
    );
  }).pipe(Effect.provide(Sqlite.layerMemory)),
);

it.effect(
  "falls back to the free day pass, links a free workspace's domain through it, and renews a refused pass once",
  () =>
    Effect.gen(function* () {
      const { fake, sync } = yield* setup;
      fake.reply((s) =>
        s.day_pass
          ? {
              outcomes: s.results.map((r) =>
                r.prompt === "over"
                  ? { outcome: "rejected", error_code: "daily_limit_reached" }
                  : { outcome: "created" },
              ),
            }
          : {
              error:
                "`submit_local_results` needs an AmICited subscription. A Pro plan or the trial unlocks it.",
            },
      );
      fake.refusePass();
      yield* sync.record(
        run("free", [
          answered("a"),
          answered("over"),
          answered("stale", "perplexity", "2026-11-16T07:00:00.000Z"),
        ]),
      );
      yield* sync.drain();
      assert.deepEqual(fake.tools, [
        "issue_local_results_pass",
        "submit_local_results",
        "submit_free_local_results",
        "issue_local_results_pass",
        "submit_free_local_results",
      ]);
      const upload = fake.uploads.at(-1)!;
      assert.deepEqual(
        {
          domain: upload.domain_id,
          pass: upload.day_pass,
          prompts: upload.results.map((r) => r.prompt),
        },
        { domain: "domain-2", pass: "pass-2026-11-19", prompts: ["a", "over"] },
      );
      const [state] = yield* sync.status();
      assert.deepEqual([state?.projectId, state?.state, state?.skipped], ["free", "synced", 2]);

      yield* TestClock.adjust("1 day");
      yield* sync.drain();
      assert.equal(fake.tools.length, 5);
    }).pipe(Effect.provide(Sqlite.layerMemory)),
);

import { CloudClient } from "@amicited/cloud-client";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { ProjectService } from "../project/ProjectService.ts";
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

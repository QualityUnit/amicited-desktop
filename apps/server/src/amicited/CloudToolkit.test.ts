import { CloudClient } from "@amicited/cloud-client";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { AmicitedCloud } from "./Cloud.ts";
import { CloudToolkit, layer } from "./CloudToolkit.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../mcp/McpToolAccess.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import { liveThreadShell, liveThreadsLayer } from "../mcp/McpToolAccess.testkit.ts";
const encodeCall = Schema.encodeUnknownEffect(
  Schema.toCodecJson(Schema.toEncoded(CloudToolkit.tools.amicited_cloud_call.successSchema)),
);
const encodeFailure = Schema.encodeUnknownEffect(
  Schema.toCodecJson(Schema.toEncoded(CloudToolkit.tools.amicited_cloud_call.failureSchema)),
);
const encodeDiscover = Schema.encodeUnknownEffect(
  Schema.toCodecJson(Schema.toEncoded(CloudToolkit.tools.amicited_cloud_discover.successSchema)),
);
it.effect("proxies reads while refusing writes from a read-only client", () =>
  Effect.gen(function* () {
    const calls: string[] = [];
    const cloud = new CloudClient({
      secrets: { read: async () => undefined, write: async () => {}, clear: async () => {} },
      openExternal: async () => {},
    });
    cloud.toolPolicy = async (name) => ({ needsApproval: name !== "free_site_health_get" });
    cloud.call = async (name) => {
      calls.push(name);
      return { content: [{ type: "text", text: "workspace data" }] };
    };
    const dependencies = Layer.mergeAll(
      Layer.succeed(AmicitedCloud, cloud),
      liveThreadsLayer,
      Layer.succeed(McpInvocationContext.McpInvocationContext, {
        environmentId: EnvironmentId.make("cloud-test"),
        requestNamespace: "cloud-test",
        thread: {
          threadId: ThreadId.make("cloud-test"),
          providerSessionId: "cloud-test",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        client: { sessionId: "cloud-test", label: "Test client", access: "read-only" },
        capabilities: new Set(["orchestration" as const]),
        issuedAt: 0,
      }),
    );
    yield* Effect.gen(function* () {
      const toolkit = yield* CloudToolkit;
      const read = yield* toolkit
        .handle("amicited_cloud_discover", { tool: "list_toolsets", arguments: {} })
        .pipe(Stream.unwrap, Stream.runCollect);
      yield* encodeDiscover(read.at(-1)?.encodedResult);
      expect(read.at(-1)?.result).toMatchObject({
        result: { content: [{ text: "workspace data" }] },
      });
      const write = yield* toolkit
        .handle("amicited_cloud_call", {
          tool: "free_site_health_start",
          arguments: {},
          approved: true,
        })
        .pipe(Stream.unwrap, Stream.runCollect);
      yield* encodeCall(write.at(-1)?.encodedResult);
      expect(write.at(-1)?.result).toMatchObject({
        result: { structuredContent: { code: "capability_denied" } },
      });
      const pending = yield* toolkit
        .handle("amicited_cloud_call", {
          tool: "free_site_health_start",
          arguments: {},
          approved: false,
        })
        .pipe(Stream.unwrap, Stream.runCollect);
      yield* encodeCall(pending.at(-1)?.encodedResult);
      expect(pending.at(-1)?.result).toMatchObject({
        result: { structuredContent: { code: "capability_denied" } },
      });
      yield* toolkit
        .handle("amicited_cloud_call", {
          tool: "free_site_health_get",
          arguments: {},
          approved: false,
        })
        .pipe(Stream.unwrap, Stream.runCollect);
      expect(calls).toEqual(["list_toolsets", "free_site_health_get"]);
    }).pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(layer).pipe(Layer.provideMerge(dependencies)),
      ),
    );
  }),
);

it.effect("encodes cloud data, refusals and unreadable results at the MCP boundary", () =>
  Effect.gen(function* () {
    const cloud = new CloudClient({
      secrets: { read: async () => undefined, write: async () => {}, clear: async () => {} },
      openExternal: async () => {},
    });
    const dependencies = Layer.mergeAll(
      Layer.succeed(AmicitedCloud, cloud),
      liveThreadsLayer,
      Layer.succeed(McpInvocationContext.McpInvocationContext, {
        environmentId: EnvironmentId.make("cloud-test"),
        requestNamespace: "cloud-test",
        client: undefined,
        thread: {
          threadId: ThreadId.make("cloud-test"),
          providerSessionId: "cloud-test",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        capabilities: new Set(["orchestration" as const]),
        issuedAt: 0,
      }),
    );
    const toolkit = yield* CloudToolkit.pipe(
      Effect.provide(McpToolAccess.HandlersLayer.layer(layer).pipe(Layer.provide(dependencies))),
    );
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const data = {
      content: [],
      structuredContent: {
        missing: undefined,
        // @effect-diagnostics-next-line globalDateInEffect:off -- Fixture exercises native Date normalization at the SDK boundary.
        created: new Date("2026-01-01T00:00:00Z"),
        url: new URL("https://example.com/"),
        count: 12n,
        values: [undefined, Infinity],
      },
    };
    const refusal = {
      isError: true,
      content: [{ type: "text" as const, text: "Plan required" }],
      structuredContent: {
        code: "plan_required",
        details: { description: "Upgrade", extra: undefined },
      },
    };
    for (const response of [data, refusal, { content: [], structuredContent: circular }]) {
      cloud.call = async () => response;
      cloud.requestCall = async () => response;
      cloud.toolPolicy = async () => ({ needsApproval: false });
      for (const name of ["amicited_cloud_discover", "amicited_cloud_call"] as const) {
        const results = yield* toolkit
          .handle(name, {
            tool: "list_toolsets",
            arguments: {},
          })
          .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
        const result = results.at(-1)!;
        const json = yield* (
          result.isFailure
            ? encodeFailure
            : name === "amicited_cloud_discover"
              ? encodeDiscover
              : encodeCall
        )(result.encodedResult);
        if (response === data)
          expect(json).toMatchObject({
            result: {
              structuredContent: {
                created: "2026-01-01T00:00:00.000Z",
                url: "https://example.com/",
                count: "12",
                values: [null, null],
              },
            },
          });
        else if (response === refusal)
          expect(json).toMatchObject({
            result: {
              isError: true,
              structuredContent: { code: "plan_required", details: { description: "Upgrade" } },
            },
          });
        else {
          expect(result.isFailure).toBe(true);
          expect(json).toMatchObject({ message: "AmICited returned data the app could not read" });
        }
      }
    }
  }),
);

it.effect("keeps a real approval pending until the user declines and encodes the refusal", () =>
  Effect.gen(function* () {
    const cloud = new CloudClient({
      secrets: { read: async () => undefined, write: async () => {}, clear: async () => {} },
      openExternal: async () => {},
    });
    cloud.toolPolicy = async () => ({ needsApproval: true });
    let pending: unknown;
    const unsubscribe = cloud.subscribeApprovals(() => {
      const request = cloud.pendingApprovals()[0];
      if (request) {
        pending = request;
        void cloud.answerApproval(request.requestId, "decline");
      }
    });
    const dependencies = Layer.mergeAll(
      Layer.succeed(AmicitedCloud, cloud),
      Layer.mock(ThreadManagement.ThreadManagementService)({
        getThreadShell: (id) =>
          Effect.succeed(liveThreadShell(id, { runtimeMode: "approval-required" })),
      }),
      Layer.succeed(McpInvocationContext.McpInvocationContext, {
        environmentId: EnvironmentId.make("cloud-test"),
        requestNamespace: "cloud-test",
        client: undefined,
        thread: {
          threadId: ThreadId.make("cloud-test"),
          providerSessionId: "cloud-test",
          providerInstanceId: ProviderInstanceId.make("codex"),
        },
        capabilities: new Set(["orchestration" as const]),
        issuedAt: 0,
      }),
    );
    yield* Effect.gen(function* () {
      const toolkit = yield* CloudToolkit;
      const results = yield* toolkit
        .handle("amicited_cloud_call", { tool: "paid_write", arguments: {} })
        .pipe(Stream.unwrap, Stream.runCollect);
      expect(pending).toMatchObject({ tool: "paid_write", threadId: "cloud-test" });
      expect(cloud.pendingApprovals()).toEqual([]);
      const json = yield* encodeCall(results.at(-1)?.encodedResult);
      expect(json).toMatchObject({
        result: {
          isError: true,
          content: [{ text: "The user declined this AmICited action. Nothing was run." }],
        },
      });
    }).pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(layer).pipe(Layer.provideMerge(dependencies)),
      ),
      Effect.ensuring(Effect.sync(unsubscribe)),
    );
  }),
);

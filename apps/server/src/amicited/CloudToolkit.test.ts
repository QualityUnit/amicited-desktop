import { CloudClient } from "@amicited/cloud-client";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { AmicitedCloud } from "./Cloud.ts";
import { CloudToolkit, layer } from "./CloudToolkit.ts";
import * as McpInvocationContext from "../mcp/McpInvocationContext.ts";
import * as McpToolAccess from "../mcp/McpToolAccess.ts";
import { liveThreadsLayer } from "../mcp/McpToolAccess.testkit.ts";
it.effect("proxies reads while refusing writes from a read-only client", () =>
  Effect.gen(function* () {
    const calls: string[] = [];
    const cloud = new CloudClient({
      secrets: { read: async () => undefined, write: async () => {}, clear: async () => {} },
      openExternal: async () => {},
    });
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
        .handle("amicited_cloud_read", { tool: "list_domains", arguments: {} })
        .pipe(Stream.unwrap, Stream.runCollect);
      expect(read.at(-1)?.result).toMatchObject({ content: [{ text: "workspace data" }] });
      const write = yield* toolkit
        .handle("amicited_cloud_run", { arguments: {} })
        .pipe(Stream.unwrap, Stream.runCollect);
      expect(write.at(-1)?.result).toMatchObject({ code: "capability_denied" });
      expect(calls).toEqual(["list_domains"]);
    }).pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(layer).pipe(Layer.provideMerge(dependencies)),
      ),
    );
  }),
);

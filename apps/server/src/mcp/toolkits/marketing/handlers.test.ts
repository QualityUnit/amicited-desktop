import type { Connection } from "@amicited/cloud-client/model";
import * as Schema from "effect/Schema";
import { CloudClient } from "@amicited/cloud-client";
import { AmicitedCloud } from "../../../amicited/Cloud.ts";
import { expect, it } from "@effect/vitest";
import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as MarketingTools from "@amicited/tools/service";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import * as Testkit from "../../McpToolAccess.testkit.ts";
import * as Handlers from "./handlers.ts";
import { MarketingToolkit } from "./tools.ts";
const encodeConnection = Schema.encodeUnknownEffect(
  Schema.toCodecJson(Schema.toEncoded(MarketingToolkit.tools.amicited_connection.successSchema)),
);
const encodeSearch = Schema.encodeUnknownEffect(
  Schema.toCodecJson(Schema.toEncoded(MarketingToolkit.tools.marketing_tools_search.successSchema)),
);
const encodeRunFailure = Schema.encodeUnknownEffect(
  Schema.toCodecJson(Schema.toEncoded(MarketingToolkit.tools.marketing_tools_run.failureSchema)),
);
const encodeRun = Schema.encodeUnknownEffect(
  Schema.toCodecJson(Schema.toEncoded(MarketingToolkit.tools.marketing_tools_run.successSchema)),
);
it.effect("MCP discovers the library and prevents read-only clients consuming provider calls", () =>
  Effect.gen(function* () {
    const scope: McpInvocationContext.McpInvocationScope = {
      environmentId: EnvironmentId.make("marketing-test"),
      requestNamespace: "client:test",
      thread: undefined,
      client: { sessionId: "test", label: "Test", access: "read-only" },
      issuedAt: 0,
      capabilities: new Set(),
    };
    const dependencies = Layer.mergeAll(
      MarketingTools.layer,
      Layer.succeed(
        AmicitedCloud,
        new CloudClient({
          secrets: { read: async () => undefined, write: async () => {}, clear: async () => {} },
          openExternal: async () => {},
        }),
      ),
      Testkit.liveThreadsLayer,
      Layer.succeed(McpInvocationContext.McpInvocationContext, scope),
    );
    const toolkit = yield* MarketingToolkit.pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(Handlers.layer).pipe(Layer.provide(dependencies)),
      ),
    );
    const connection = yield* toolkit
      .handle("amicited_connection", { request: "citations" })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    yield* encodeConnection(connection.at(-1)?.encodedResult);
    expect(connection.at(-1)?.result).toMatchObject({
      state: "hidden",
      instruction: expect.stringContaining("Do not suggest"),
    });
    const search = yield* toolkit
      .handle("marketing_tools_search", { query: "visibility" })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    yield* encodeSearch(search.at(-1)?.encodedResult);
    expect(search.at(-1)?.result).toMatchObject([
      expect.objectContaining({ name: "ai.visibility.check" }),
    ]);
    const refused = yield* toolkit
      .handle("marketing_tools_run", {
        name: "content.write",
        input: { brief: "Draft", channel: "email", tone: "warm" },
      })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    yield* encodeRunFailure(refused.at(-1)?.encodedResult);
    expect(refused.at(-1)?.result).toMatchObject({ code: "capability_denied" });
  }),
);

const connectionStates: readonly Connection[] = [
  { state: "connected", workspace: "Workspace", scopes: [] },
  { state: "connected", workspace: "Workspace", scopes: [], access: "free" },
  { state: "connected", workspace: "Workspace", scopes: [], access: "full" },
  { state: "disconnected" },
  { state: "connecting" },
  {
    state: "error",
    kind: "auth",
    message: "Connect again",
    code: "access_denied",
    description: "You must belong to a workspace",
    actionUrl: "https://app.flowhunt.io/",
  },
];
it.effect.each(connectionStates)("encodes connection %j for MCP", (state) =>
  Effect.gen(function* () {
    const cloud = new CloudClient({
      secrets: { read: async () => undefined, write: async () => {}, clear: async () => {} },
      openExternal: async () => {},
    });
    cloud.status = async () => state;
    const connectionForRequest = cloud.connectionForRequest.bind(cloud);
    cloud.connectionForRequest = (request) => connectionForRequest(request, true, true);
    const dependencies = Layer.mergeAll(
      MarketingTools.layer,
      Layer.succeed(AmicitedCloud, cloud),
      Testkit.liveThreadsLayer,
      Layer.succeed(McpInvocationContext.McpInvocationContext, {
        environmentId: EnvironmentId.make("marketing-test"),
        requestNamespace: "test",
        thread: undefined,
        capabilities: new Set(["orchestration" as const]),
        issuedAt: 0,
        client: { sessionId: "test", label: "Test", access: "full-access" },
      }),
    );
    const toolkit = yield* MarketingToolkit.pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(Handlers.layer).pipe(Layer.provide(dependencies)),
      ),
    );
    const results = yield* toolkit
      .handle("amicited_connection", { request: "citations" })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    const result = results.at(-1)!;
    // McpServer.registerToolkit applies this JSON codec after Toolkit.handle encodes the result.
    const json = yield* encodeConnection(result.encodedResult);
    expect(json).toMatchObject({ state: state.state });
    if (state.state === "connected")
      expect(json).toHaveProperty("access", state.access ?? "unknown");
    if (state.state === "error")
      expect(json).toHaveProperty("connection.description", state.description);
    const run = yield* toolkit
      .handle("marketing_tools_run", {
        name: "content.readability",
        input: { text: "A useful short sentence." },
      })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    expect(run.at(-1)?.isFailure).toBe(false);
    yield* encodeRun(run.at(-1)?.encodedResult);
  }),
);

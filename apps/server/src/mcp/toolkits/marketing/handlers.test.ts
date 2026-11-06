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
      Testkit.liveThreadsLayer,
      Layer.succeed(McpInvocationContext.McpInvocationContext, scope),
    );
    const toolkit = yield* MarketingToolkit.pipe(
      Effect.provide(
        McpToolAccess.HandlersLayer.layer(Handlers.layer).pipe(Layer.provide(dependencies)),
      ),
    );
    const search = yield* toolkit
      .handle("marketing_tools_search", { query: "visibility" })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    expect(search.at(-1)?.result).toMatchObject([
      expect.objectContaining({ name: "ai.visibility.check" }),
    ]);
    const refused = yield* toolkit
      .handle("marketing_tools_run", {
        name: "content.write",
        input: { brief: "Draft", channel: "email", tone: "warm" },
      })
      .pipe(Stream.unwrap, Stream.runCollect, Effect.provide(dependencies));
    expect(refused.at(-1)?.result).toMatchObject({ code: "capability_denied" });
  }),
);

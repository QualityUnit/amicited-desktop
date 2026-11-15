import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  ThreadId,
  TerminalSessionLookupError,
  type TerminalSessionSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { SitePreviewToolkit, layer, sitePreviewLayer } from "./SitePreview.ts";
import { TerminalManager } from "../terminal/Manager.ts";
import { McpInvocationContext } from "../mcp/McpInvocationContext.ts";
import * as Access from "../mcp/McpToolAccess.ts";
import * as Testkit from "../mcp/McpToolAccess.testkit.ts";
import { ThreadManagementService } from "../orchestration-v2/ThreadManagementService.ts";

it.effect.each(["full-access", "approval-required"] as const)(
  "site process respects %s and stays owned by the calling thread",
  (runtimeMode) =>
    Effect.gen(function* () {
      const calls: string[] = [];
      let snapshot: TerminalSessionSnapshot | undefined;
      const threadId = ThreadId.make("site-thread");
      const dependencies = Layer.mergeAll(
        Layer.succeed(McpInvocationContext, {
          environmentId: EnvironmentId.make("test"),
          issuedAt: 0,
          requestNamespace: "test",
          capabilities: new Set(["orchestration"] as const),
          client: undefined,
          thread: {
            threadId,
            providerSessionId: "session",
            providerInstanceId: Testkit.liveThreadShell(threadId).providerInstanceId,
          },
        }),
        Layer.mock(ThreadManagementService)({
          getThreadShell: (id) => Effect.succeed(Testkit.liveThreadShell(id, { runtimeMode })),
        }),
        Layer.mock(TerminalManager)({
          observeStream: (input, listener) =>
            snapshot
              ? listener({ type: "snapshot", snapshot }).pipe(Effect.as(() => {}))
              : Effect.fail(new TerminalSessionLookupError(input)),
          open: (input) =>
            Effect.sync(() => {
              calls.push(`open:${input.threadId}:${input.terminalId}`);
              snapshot = {
                ...input,
                status: "running",
                pid: 123,
                history: "",
                exitCode: null,
                exitSignal: null,
                worktreePath: null,
                label: "Site",
                updatedAt: "2026-01-01",
              };
              return snapshot;
            }),
          write: (input) =>
            Effect.sync(() => {
              calls.push(input.data);
            }),
          close: (input) =>
            Effect.sync(() => {
              calls.push(`close:${input.threadId}:${input.terminalId}`);
            }),
        }),
      );
      const toolkit = yield* SitePreviewToolkit.pipe(
        Effect.provide(
          Access.HandlersLayer.layer(layer).pipe(
            Layer.provide(Layer.provideMerge(sitePreviewLayer, dependencies)),
          ),
        ),
      );
      const result = yield* toolkit
        .handle("site_preview_start", { cwd: "/fixture", command: "npm run dev" })
        .pipe(
          Stream.unwrap,
          Stream.runCollect,
          Effect.provide(Layer.provideMerge(sitePreviewLayer, dependencies)),
        );
      if (runtimeMode === "full-access") {
        expect(result.at(-1)?.result).toMatchObject({ pid: 123 });
        expect(calls).toEqual(["open:site-thread:amicited-site", "npm run dev\r"]);
        const duplicate = yield* toolkit
          .handle("site_preview_start", { cwd: "/fixture", command: "npm run dev" })
          .pipe(
            Stream.unwrap,
            Stream.runCollect,
            Effect.provide(Layer.provideMerge(sitePreviewLayer, dependencies)),
          );
        expect(duplicate.at(-1)?.result).toMatchObject({ code: "invalid_request" });
        expect(calls).toHaveLength(2);

        yield* toolkit
          .handle("site_preview_stop", {})
          .pipe(
            Stream.unwrap,
            Stream.runDrain,
            Effect.provide(Layer.provideMerge(sitePreviewLayer, dependencies)),
          );
        expect(calls.at(-1)).toBe("close:site-thread:amicited-site");
      } else {
        expect(result.at(-1)?.result).toMatchObject({
          code: "capability_denied",
          message: expect.stringContaining("Full access"),
        });
        expect(calls).toEqual([]);
      }
    }),
);

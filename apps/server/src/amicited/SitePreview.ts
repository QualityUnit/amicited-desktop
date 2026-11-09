import { OrchestratorMcpFailure, TerminalSessionSnapshot } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as KeyedLock from "@t3tools/shared/KeyedLock";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as Terminal from "../terminal/Manager.ts";
import * as Invocation from "../mcp/McpInvocationContext.ts";
import * as Threads from "../orchestration-v2/ThreadManagementService.ts";
import * as Access from "../mcp/McpToolAccess.ts";
import { assertFullAccess, readCaller } from "../mcp/threadAccess.ts";

class SitePreview extends Context.Service<
  SitePreview,
  {
    readonly start: (input: {
      threadId: string;
      cwd: string;
      command: string;
    }) => Effect.Effect<TerminalSessionSnapshot, OrchestratorMcpFailure>;
    readonly status: (
      threadId: string,
    ) => Effect.Effect<TerminalSessionSnapshot, OrchestratorMcpFailure>;
    readonly stop: (
      threadId: string,
    ) => Effect.Effect<{ stopped: boolean }, OrchestratorMcpFailure>;
  }
>()("t3/amicited/SitePreview") {}
const SITE_TERMINAL_ID = "amicited-site";
export const SitePreviewToolkit = Toolkit.make(
  Tool.make("site_preview_start", {
    description:
      "Run the site's local development server in a T3 terminal that survives your turn. Read README, CLAUDE.md, AGENTS.md and scripts first; choose its fastest local preview, never deployment. Prefer npm run scripts to resolve local executables; command not found is not missing dependencies. Pass the workspace cwd and foreground command (no &, nohup or shell detaching). Returns immediately: inspect progress with site_preview_status; report long builds honestly. Once ready, call preview_open with its localhost URL and open:true to show it beside the chat. The user can view logs and stop it. Requires Full access. For preview-only requests never edit site files, templates or submodules to repair errors: report the blocker. Do not start twice; stop before restarting.",
    parameters: Schema.Struct({
      cwd: Schema.String,
      command: Schema.String.check(Schema.isMinLength(1)).check(Schema.isMaxLength(8192)),
    }),
    success: TerminalSessionSnapshot,
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [SitePreview, Invocation.McpInvocationContext, Threads.ThreadManagementService],
  }),
  Tool.make("site_preview_status", {
    description:
      "Read the site terminal's current output without waiting or restarting it. A running shell is not proof the site is ready: check the output and HTTP before opening preview_open.",
    parameters: Tool.EmptyParams,
    success: TerminalSessionSnapshot,
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [SitePreview, Invocation.McpInvocationContext],
  }).annotate(Tool.Readonly, true),
  Tool.make("site_preview_stop", {
    description:
      "Stop this thread's local site server and its terminal using T3's existing process cleanup.",
    parameters: Tool.EmptyParams,
    success: Schema.Struct({ stopped: Schema.Boolean }),
    failure: OrchestratorMcpFailure,
    failureMode: "return",
    dependencies: [SitePreview, Invocation.McpInvocationContext, Threads.ThreadManagementService],
  }),
);
const isMcpFailure = Schema.is(OrchestratorMcpFailure);
const failure = (error: { message: string }) =>
  isMcpFailure(error)
    ? error
    : new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message });
const make = Effect.gen(function* () {
  const manager = yield* Terminal.TerminalManager;
  const locks = yield* KeyedLock.make<string>();
  const session = (threadId: string) => ({ threadId, terminalId: SITE_TERMINAL_ID });
  const status = Effect.fn("SitePreview.status")(function* (threadId: string) {
    return yield* Effect.scoped(
      Effect.gen(function* () {
        let snapshot: TerminalSessionSnapshot | undefined;
        yield* Effect.acquireRelease(
          manager.observeStream(session(threadId), (event) =>
            Effect.sync(() => {
              if (event.type === "snapshot") snapshot = event.snapshot;
            }),
          ),
          (stop) => Effect.sync(stop),
        );
        if (!snapshot)
          return yield* new OrchestratorMcpFailure({
            code: "invalid_request",
            message: "No site preview has been started in this chat.",
          });
        return snapshot;
      }),
    ).pipe(Effect.mapError(failure));
  });
  const start = Effect.fn("SitePreview.start")(
    (input: { threadId: string; cwd: string; command: string }) =>
      locks
        .withLock(
          input.threadId,
          Effect.gen(function* () {
            const previous = yield* status(input.threadId).pipe(Effect.option);
            if (previous._tag === "Some" && previous.value.status === "running")
              return yield* new OrchestratorMcpFailure({
                code: "invalid_request",
                message:
                  "A site terminal is already running. Inspect its output, or stop it before restarting.",
              });
            const snapshot = yield* manager.open({ ...session(input.threadId), cwd: input.cwd });
            yield* manager.write({ ...session(input.threadId), data: input.command + "\r" });
            return snapshot;
          }),
        )
        .pipe(Effect.mapError(failure)),
  );
  const stop = Effect.fn("SitePreview.stop")((threadId: string) =>
    locks
      .withLock(threadId, manager.close(session(threadId)))
      .pipe(Effect.as({ stopped: true }), Effect.mapError(failure)),
  );
  return SitePreview.of({ start, status, stop });
});
const callerThread = Effect.gen(function* () {
  const scope = yield* Invocation.McpInvocationContext;
  return (yield* Invocation.requireThreadScope(scope, "Site preview")).thread.threadId;
});
const writeAccess = Effect.gen(function* () {
  yield* assertFullAccess(
    yield* readCaller(),
    "Choose Full access to run or stop a local site server.",
  );
  return yield* callerThread;
});
const serviceLayer = Layer.effect(SitePreview, make);
export const layer = Access.toLayer(SitePreviewToolkit, {
  site_preview_start: Access.actsAsCaller((input) =>
    Effect.gen(function* () {
      const threadId = yield* writeAccess;
      return yield* (yield* SitePreview).start({ ...input, threadId });
    }),
  ),
  site_preview_status: Access.readsAsCaller(() =>
    Effect.gen(function* () {
      return yield* (yield* SitePreview).status(yield* callerThread);
    }),
  ),
  site_preview_stop: Access.actsAsCaller(() =>
    Effect.gen(function* () {
      return yield* (yield* SitePreview).stop(yield* writeAccess);
    }),
  ),
});
export const sitePreviewLayer = serviceLayer;

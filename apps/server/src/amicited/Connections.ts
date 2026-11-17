import type { Page } from "playwright-core";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { ConnectionsSnapshot } from "@amicited/cloud-client/connectionsRpc";
import { ServerConfig } from "../config.ts";
import { BrowserConnections, siteAdapters } from "@amicited/cloud-client/connections";
import { ConnectionFailure } from "@amicited/cloud-client/connectionsRpc";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import { ServerBrowser } from "../preview/ServerBrowser.ts";
export class Connections extends Context.Service<
  Connections,
  {
    engine: BrowserConnections<Page>;
    snapshot: Effect.Effect<ReturnType<BrowserConnections["snapshot"]>>;
    changes: Stream.Stream<ReturnType<BrowserConnections["snapshot"]>>;
    run: <T>(
      action: (engine: BrowserConnections<Page>) => Promise<T>,
    ) => Effect.Effect<T, ConnectionFailure>;
  }
>()("t3/amicited/Connections") {}
const decodeSnapshot = Schema.decodeUnknownEffect(Schema.fromJsonString(ConnectionsSnapshot));
export const layer = Layer.effect(
  Connections,
  Effect.gen(function* () {
    const browser = yield* ServerBrowser;
    const run = Effect.runPromiseWith(yield* Effect.context<never>());
    const engine = new BrowserConnections<Page>({
      open: async (id, threadId) => {
        if (threadId) {
          const tab = await run(browser.connectionTab(threadId, siteAdapters[id].url));
          return { page: tab.page, tabId: tab.tabId, close: () => run(tab.close) };
        }
        const context = await run(browser.connectionContext);
        const page = await context.newPage();
        return { page, close: () => page.close() };
      },
      clearCookies: async (domains) => {
        const context = await run(browser.connectionContext);
        for (const domain of domains)
          await context.clearCookies({
            domain: new RegExp(String.raw`(^|\.)${domain.replaceAll(".", String.raw`\.`)}$`),
          });
      },
    });
    const fs = yield* FileSystem.FileSystem;
    const config = yield* ServerConfig;
    const file = `${config.stateDir}/amicited-connections.json`;
    const saved = yield* fs.exists(file).pipe(
      Effect.flatMap((exists) =>
        exists
          ? fs.readFileString(file).pipe(Effect.flatMap((raw) => decodeSnapshot(raw)))
          : Effect.succeed(null),
      ),
      Effect.orDie,
    );
    if (saved) engine.restore(saved.connections);
    let writes = Promise.resolve();
    const unsubscribe = engine.subscribe(() => {
      const value = JSON.stringify(engine.snapshot());
      writes = writes
        .then(() =>
          run(
            fs
              .writeFileString(`${file}.tmp`, value)
              .pipe(Effect.andThen(fs.rename(`${file}.tmp`, file))),
          ),
        )
        .catch(() => run(Effect.logWarning("Could not save browser connection metadata.")));
    });
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        unsubscribe();
        await writes;
      }),
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => engine.close()));
    yield* Effect.promise(() => engine.finishPendingSignIns()).pipe(
      Effect.repeat(Schedule.spaced("2 seconds")),
      Effect.forkScoped,
    );
    const snapshot = Effect.sync(() => engine.snapshot());
    return {
      engine,
      snapshot,
      run: Effect.fn("Connections.run")(
        <T>(action: (engine: BrowserConnections<Page>) => Promise<T>) =>
          Effect.tryPromise({
            try: () => action(engine),
            catch: (cause) =>
              new ConnectionFailure({
                message: cause instanceof Error ? cause.message : "Could not use this connection.",
              }),
          }),
      ),
      changes: Stream.callback<ReturnType<BrowserConnections["snapshot"]>>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const emit = () => {
              Queue.offerUnsafe(queue, engine.snapshot());
            };
            const off = engine.subscribe(emit);
            emit();
            return off;
          }),
          (off) => Effect.sync(off),
        ),
      ),
    };
  }),
);

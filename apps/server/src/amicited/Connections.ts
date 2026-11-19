import { runConnection } from "./ConnectionSessionAdapter.ts";
import { BrowserSessions, type BrowserMode } from "./browser/BrowserSessions.ts";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { ConnectionsSnapshot } from "@amicited/cloud-client/connectionsRpc";
import { ServerConfig } from "../config.ts";
import { BrowserConnections } from "@amicited/cloud-client/connections";
import { ConnectionFailure } from "@amicited/cloud-client/connectionsRpc";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
export class Connections extends Context.Service<
  Connections,
  {
    engine: BrowserConnections;
    /** Whether runs use the user's own browser, and why not when they do not. */
    browserMode: Effect.Effect<BrowserMode>;
    snapshot: Effect.Effect<ReturnType<BrowserConnections["snapshot"]>>;
    changes: Stream.Stream<ReturnType<BrowserConnections["snapshot"]>>;
    run: <T>(
      action: (
        engine: BrowserConnections,
        signal: AbortSignal,
        runEffect: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>,
      ) => Promise<T>,
    ) => Effect.Effect<T, ConnectionFailure>;
  }
>()("t3/amicited/Connections") {}
const decodeSnapshot = Schema.decodeUnknownEffect(Schema.fromJsonString(ConnectionsSnapshot));
export const layer = Layer.effect(
  Connections,
  Effect.gen(function* () {
    const sessions = yield* BrowserSessions;
    const run = Effect.runPromiseWith(yield* Effect.context<never>());
    const engine = new BrowserConnections({
      open: (id, threadId) => run(sessions.open(id, threadId)),
      clearCookies: (domains) => run(sessions.clearCookies(domains)),
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
      Effect.orElseSucceed(() => null),
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
      browserMode: sessions.mode,
      snapshot,
      run: Effect.fn("Connections.session")((action) => runConnection(engine, action)),
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

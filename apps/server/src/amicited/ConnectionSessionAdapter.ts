import type { Page } from "playwright-core";
import type { BrowserConnections } from "@amicited/cloud-client/connections";
import { ConnectionFailure } from "@amicited/cloud-client/connectionsRpc";
import * as Effect from "effect/Effect";

export const runConnection = Effect.fn("Connections.run")(function* <T>(
  engine: BrowserConnections<Page>,
  action: (
    engine: BrowserConnections<Page>,
    signal: AbortSignal,
    runEffect: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>,
  ) => Promise<T>,
) {
  const run = Effect.runPromiseWith(yield* Effect.context<never>());
  return yield* Effect.tryPromise({
    try: (signal) => action(engine, signal, run),
    catch: (cause) =>
      new ConnectionFailure({
        message: cause instanceof Error ? cause.message : "Could not use this connection.",
      }),
  }).pipe(Effect.ensuring(Effect.promise(() => engine.drainCancellation())));
});

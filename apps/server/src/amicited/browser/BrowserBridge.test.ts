import { assert, it } from "@effect/vitest";
import { bridgePath } from "@amicited/visibility/bridge";
import { inspect } from "@amicited/visibility/page";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { bridgePage, make } from "./BrowserBridge.ts";

class Refused extends Schema.TaggedError<Refused>()("Refused", {}) {}
const connect = (port: number, origin: string) =>
  Effect.callback<WebSocket, Refused>((resume) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${bridgePath}`, { headers: { origin } });
    socket.onopen = () => resume(Effect.succeed(socket));
    socket.onerror = () => resume(Effect.fail(new Refused()));
  });

it.live(
  "accepts only extension origins, relays page script calls, and shuts down while connected",
  () =>
    Effect.gen(function* () {
      const bridge = yield* make({ port: 0 });
      const port = bridge.port!;
      const refused = yield* Effect.exit(connect(port, "https://evil.example"));
      assert.equal(refused._tag, "Failure");

      const socket = yield* connect(port, "moz-extension://4d1c0e2a-0000-4000-8000-000000000000");
      socket.onmessage = (event) => {
        const call = JSON.parse(String(event.data)) as { id: number; method: string };
        socket.send(
          JSON.stringify({
            type: "result",
            id: call.id,
            ok: call.method === "run",
            ...(call.method === "run"
              ? {
                  value: {
                    url: "https://www.perplexity.ai/",
                    title: "Perplexity",
                    visible: [true],
                  },
                }
              : { error: "No such tab" }),
          }),
        );
      };
      socket.send(
        JSON.stringify({
          type: "hello",
          extensionVersion: "0.1.0",
          browser: { name: "Firefox", version: "156.0" },
          scripts: ["inspect"],
        }),
      );
      const connection = (yield* bridge.awaitConnection("5 seconds"))!;
      assert.equal(connection.info.family, "firefox");
      const page = bridgePage(connection, 7);
      const state = yield* Effect.promise(() => page.run(inspect, { selectors: ["main"] }));
      assert.deepEqual(state.visible, [true]);
      const failed = yield* Effect.exit(
        Effect.tryPromise({
          try: () => page.goto("https://example.com/"),
          catch: () => new Refused(),
        }),
      );
      assert.equal(failed._tag, "Failure");
    }).pipe(Effect.scoped),
);

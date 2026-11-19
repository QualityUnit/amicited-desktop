// @effect-diagnostics nodeBuiltinImport:off - The connector bridge is a loopback Node HTTP boundary.
import {
  bridgePath,
  defaultBridgePort,
  isExtensionOrigin,
  type BridgeCall,
} from "@amicited/visibility/bridge";
import { browserFamily, type DefaultBrowser } from "@amicited/visibility/browsers";
import {
  clickElement,
  insertText,
  pressKey,
  type EnginePage,
  type PageScript,
} from "@amicited/visibility/page";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Socket from "effect/socket/Socket";
import * as NodeHttp from "node:http";

export interface ConnectorInfo {
  /** For people, e.g. "Firefox 156.0". */
  readonly browser: string;
  readonly family: DefaultBrowser["family"];
  readonly extensionVersion: string;
  readonly scripts: ReadonlySet<string>;
}
/** One connected AmICited Connector extension. */
export interface BridgeConnection {
  readonly info: ConnectorInfo;
  readonly call: (call: BridgeCall, timeoutMs: number) => Promise<unknown>;
}

export class BridgeError extends Schema.TaggedError<BridgeError>()("BridgeError", {
  message: Schema.String,
}) {}

export class BrowserBridge extends Context.Service<
  BrowserBridge,
  {
    /** The loopback port the connector dials, or null when the bridge could not listen. */
    readonly port: number | null;
    readonly current: Effect.Effect<BridgeConnection | null>;
    readonly awaitConnection: (timeout: Duration.Input) => Effect.Effect<BridgeConnection | null>;
    readonly subscribe: (listener: () => void) => () => void;
  }
>()("t3/amicited/browser/BrowserBridge") {}

const ConnectorMessage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("hello"),
    extensionVersion: Schema.String,
    browser: Schema.Struct({ name: Schema.String, version: Schema.String }),
    scripts: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("result"),
    id: Schema.Number,
    ok: Schema.Boolean,
    value: Schema.optionalKey(Schema.Unknown),
    error: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ type: Schema.Literal("ping") }),
]);
const decodeMessage = Schema.decodeUnknownOption(Schema.fromJsonString(ConnectorMessage));
const encodeFrame = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const closedError = () => new BridgeError({ message: "The browser connection closed." });
const landing = `<!doctype html><meta charset="utf-8"><title>AmICited Connector</title>
<body style="font:15px system-ui;margin:3rem;max-width:36rem;color:#222">
<h1 style="font-size:1.3rem">AmICited is using this browser</h1>
<p>AmICited Desktop opened this tab to check your AI visibility with your own sign-ins.
It will reuse this tab and close it when the check is done.</p></body>`;

/**
 * The loopback endpoint the AmICited Connector extension dials from the user's own browser.
 * Only extension origins may connect; web pages cannot forge an Origin header.
 */
export const make = Effect.fn("BrowserBridge.make")(function* (options: { readonly port: number }) {
  const run = Effect.runPromiseWith(yield* Effect.context<never>());
  let current: BridgeConnection | null = null;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((listener) => listener());
  const waiters = new Set<Deferred.Deferred<BridgeConnection>>();
  const writers = new Set<Socket.Writer>();

  const serveSocket = Effect.fn("BrowserBridge.serveSocket")(function* (socket: Socket.Socket) {
    const writer = yield* socket.writer;
    writers.add(writer);
    const pull = yield* Socket.readerString(socket);
    const pending = new Map<number, Deferred.Deferred<unknown, BridgeError>>();
    let nextId = 0;
    let connection: BridgeConnection | null = null;
    const call = (bridgeCall: BridgeCall, timeoutMs: number) =>
      run(
        Effect.gen(function* () {
          const id = ++nextId;
          const reply = yield* Deferred.make<unknown, BridgeError>();
          pending.set(id, reply);
          yield* encodeFrame({ type: "call", id, ...bridgeCall }).pipe(
            Effect.flatMap((frame) => writer.write(frame)),
            Effect.mapError(closedError),
          );
          return yield* Deferred.await(reply).pipe(
            Effect.timeoutOrElse({
              duration: Duration.millis(timeoutMs),
              orElse: () =>
                Effect.fail(new BridgeError({ message: "The browser did not respond in time." })),
            }),
            Effect.ensuring(Effect.sync(() => pending.delete(id))),
          );
        }),
      );
    yield* Effect.gen(function* () {
      for (;;) {
        for (const frame of yield* pull) {
          const message = decodeMessage(frame);
          if (Option.isNone(message)) continue;
          const m = message.value;
          if (m.type === "hello") {
            connection = {
              info: {
                browser: `${m.browser.name} ${m.browser.version}`.trim(),
                family: browserFamily(m.browser.name),
                extensionVersion: m.extensionVersion,
                scripts: new Set(m.scripts),
              },
              call,
            };
            current = connection;
            for (const waiter of waiters) yield* Deferred.succeed(waiter, connection);
            changed();
          } else if (m.type === "result") {
            const reply = pending.get(m.id);
            if (!reply) continue;
            if (m.ok) yield* Deferred.succeed(reply, m.value);
            else
              yield* Deferred.fail(
                reply,
                new BridgeError({ message: m.error ?? "The browser could not do that." }),
              );
          }
        }
      }
    }).pipe(
      Effect.ignore,
      Effect.ensuring(
        Effect.gen(function* () {
          writers.delete(writer);
          for (const reply of pending.values()) yield* Deferred.fail(reply, closedError());
          if (connection && current === connection) {
            current = null;
            changed();
          }
        }),
      ),
    );
  });

  const handler = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = request.url.split("?")[0];
    if (path === bridgePath) {
      if (!isExtensionOrigin(request.headers.origin))
        return HttpServerResponse.text("Forbidden", { status: 403 });
      const socket = yield* request.upgrade;
      yield* Effect.scoped(serveSocket(socket));
      return HttpServerResponse.empty();
    }
    if (path === "/" && request.method === "GET") return HttpServerResponse.html(landing);
    return HttpServerResponse.text("Not found", { status: 404 });
  }).pipe(Effect.orElseSucceed(() => HttpServerResponse.text("Error", { status: 500 })));

  // The server's WebSocketServer waits for every client when it closes, so connector
  // sockets are closed first, in this order, rather than by finalizer order.
  const serverScope = yield* Scope.make();
  yield* Effect.addFinalizer((exit) =>
    Effect.forEach(writers, (w) => w.write(new Socket.CloseEvent(1001)).pipe(Effect.ignore), {
      discard: true,
    }).pipe(Effect.andThen(Scope.close(serverScope, exit))),
  );
  const server = yield* NodeHttpServer.make(NodeHttp.createServer, {
    port: options.port,
    host: "127.0.0.1",
  }).pipe(
    Effect.tapError(() =>
      Effect.logWarning(
        `AmICited could not listen on 127.0.0.1:${options.port} for its browser connector; the AmICited browser will be used.`,
      ),
    ),
    Effect.option,
    Scope.provide(serverScope),
  );
  if (Option.isSome(server)) yield* server.value.serve(handler).pipe(Scope.provide(serverScope));
  const address = Option.isSome(server) ? server.value.address : null;

  return BrowserBridge.of({
    port: address && "port" in address ? address.port : null,
    current: Effect.sync(() => current),
    awaitConnection: Effect.fn("BrowserBridge.awaitConnection")(function* (timeout) {
      if (current) return current;
      const waiter = yield* Deferred.make<BridgeConnection>();
      waiters.add(waiter);
      return yield* Deferred.await(waiter).pipe(
        Effect.timeoutOption(timeout),
        Effect.map(Option.getOrNull),
        Effect.ensuring(Effect.sync(() => waiters.delete(waiter))),
      );
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
});

export const layer = Layer.effect(
  BrowserBridge,
  make({ port: Number(process.env.AMICITED_BROWSER_BRIDGE_PORT) || defaultBridgePort }),
);

/** A page in a tab of the user's own browser, driven through the connector. */
export function bridgePage(connection: BridgeConnection, tabId: number): EnginePage {
  let closed = false;
  const run = (script: string, arg: unknown) =>
    connection.call({ method: "run", params: { tabId, script, arg } }, 60_000);
  return {
    driver: "extension",
    browser: connection.info.browser,
    goto: async (url, options) => {
      const timeoutMs = options?.timeoutMs ?? 30_000;
      await connection.call(
        { method: "goto", params: { tabId, url, timeoutMs } },
        timeoutMs + 5_000,
      );
    },
    async run<A, R>(script: PageScript<A, R>, arg: A) {
      if (!connection.info.scripts.has(script.name))
        throw new Error("Update the AmICited Connector extension to run this check.");
      return (await run(script.name, arg)) as R;
    },
    type: async (selector, text) => {
      await run(insertText.name, { selector, text });
    },
    press: async (selector, key) => {
      await run(pressKey.name, { selector, key });
    },
    click: async (selector) => {
      await run(clickElement.name, { selector });
    },
    close: async () => {
      if (closed) return;
      closed = true;
      await connection.call({ method: "close", params: { tabId } }, 10_000).catch(() => {});
    },
    isClosed: () => closed,
  };
}

import { HttpServer } from "effect/http";
import * as NetAddress from "effect/net/NetAddress";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as ServerConfig from "../config.ts";
import * as SecretStore from "../auth/ServerSecretStore.ts";
import * as Preview from "./ReportsPreview.ts";

it.effect("rejects a preview token for another report and after expiry", () =>
  Effect.gen(function* () {
    const preview = yield* Preview.ReportsPreview;
    const url = new URL(yield* preview.url("report-a"));
    assert.equal(url.port, "43210");
    const token = url.searchParams.get("token")!;
    assert.equal(yield* preview.verify("report-a", token), true);
    assert.equal(yield* preview.verify("report-b", token), false);
    assert.equal(yield* preview.verify("report-a", `${token}changed`), false);
    yield* TestClock.adjust("11 hours");
    assert.equal(yield* preview.verify("report-a", token), true);
    const short = new URL(yield* preview.path("snapshot-a", "pdf"), "http://localhost");
    const shortToken = short.searchParams.get("token")!;
    assert.equal(yield* preview.verify("snapshot-a", shortToken, "pdf"), true);
    assert.equal(yield* preview.verify("snapshot-a", shortToken, "html"), false);
    assert.equal(yield* preview.verify("snapshot-b", shortToken, "pdf"), false);
    yield* TestClock.adjust("11 minutes");
    assert.equal(yield* preview.verify("snapshot-a", shortToken, "pdf"), false);
    yield* TestClock.adjust("2 hours");
    assert.equal(yield* preview.verify("report-a", token), false);
  }).pipe(
    Effect.provide(
      Preview.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.mock(HttpServer.HttpServer)({
              address: NetAddress.inetAddressUnsafe(NetAddress.ipv4Loopback, 43210),
            }),
            Layer.mock(SecretStore.ServerSecretStore)({
              getOrCreateRandom: () => Effect.succeed(new Uint8Array(32).fill(4)),
            }),
            ServerConfig.layerTest(process.cwd(), { prefix: "reports-preview-" }).pipe(
              Layer.provide(NodeServices.layer),
            ),
            NodeCrypto.layer,
          ),
        ),
      ),
    ),
  ),
);

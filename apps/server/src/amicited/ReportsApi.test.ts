// @effect-diagnostics nodeBuiltinImport:off - A local HTTP fixture verifies the actual credential transport.
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import * as Layer from "effect/Layer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ServerConfig from "../config.ts";
import * as NodeHttp from "node:http";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as ConfigProvider from "effect/ConfigProvider";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as SqlClient from "effect/sql/SqlClient";
import { CloudClient } from "@amicited/cloud-client";
import { DomainConnections } from "@amicited/cloud-client/domains";
import { AmicitedCloud } from "./Cloud.ts";
import * as ReportsApi from "./ReportsApi.ts";
import * as Reports from "./Reports.ts";

it.live("injects ids, redacts upstream credential echoes and isolates upstream failures", () =>
  Effect.gen(function* () {
    const key = "fixture-api-secret";
    const requests: URL[] = [];
    let catalogAvailable = false;
    let authStatus = 200;
    const server = NodeHttp.createServer((req, res) => {
      const url = new URL(req.url!, "http://localhost");
      requests.push(url);
      if (url.pathname !== "/openapi.json") assert.equal(req.headers["api-key"], key);
      res.setHeader("content-type", "application/json");
      if (url.pathname === "/openapi.json") {
        if (!catalogAvailable) {
          res.writeHead(503);
          res.end("unavailable");
          return;
        }
        res.end(
          JSON.stringify({
            paths: {
              "/v2/amicited/global": {
                get: { parameters: [{ in: "query", name: "workspace_id" }] },
              },
              "/v2/amicited/path-param": {
                get: {
                  parameters: [
                    { in: "query", name: "domain_id" },
                    { in: "path", name: "id" },
                  ],
                },
              },
              ...Object.fromEntries(
                ["good", "failure"].map((p) => [
                  `/v2/amicited/${p}`,
                  {
                    get: {
                      parameters: [
                        { in: "query", name: "domain_id" },
                        { in: "query", name: "workspace_id" },
                      ],
                    },
                  },
                ]),
              ),
            },
          }),
        );
      } else if (url.pathname === "/v2/auth/me") {
        if (authStatus === -1) {
          req.destroy();
          return;
        }
        if (authStatus !== 200) {
          res.writeHead(authStatus);
          res.end(key);
          return;
        }
        res.end(JSON.stringify({ api_key_workspace_id: "ws" }));
      } else if (url.pathname === "/v2/amicited/domains")
        res.end(JSON.stringify([{ domain_id: "domain", domain_name: "example.com" }]));
      else if (url.pathname.endsWith("failure")) {
        res.writeHead(500);
        res.end(key);
      } else res.end(JSON.stringify({ value: 42, echo: key }));
    });
    yield* Effect.acquireRelease(
      Effect.promise(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))),
      () =>
        Effect.promise(
          () =>
            new Promise<void>((resolve, reject) =>
              server.close((e) => (e ? reject(e) : resolve())),
            ),
        ),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture address");
    const secrets = {
      read: async () => JSON.stringify({ apiKey: key }),
      write: async () => {},
      clear: async () => {},
    };
    const cloud = new CloudClient({ secrets, openExternal: async () => {} });
    cloud.domains = new DomainConnections({
      read: async () => [
        {
          projectId: "a",
          hostname: "example.com",
          brand: "Example",
          connectionRef: "a",
        },
        { projectId: "b", hostname: "example.com", brand: "Example", connectionRef: "b" },
        { projectId: "no-key", hostname: "example.com", brand: "Example", connectionRef: "no-key" },
      ],
      write: async () => {},
      secrets: (id) => (id === "no-key" ? { ...secrets, read: async () => undefined } : secrets),
      legacy: secrets,
      changed: () => {},
      client: (s) => new CloudClient({ secrets: s, openExternal: async () => {} }),
    });
    yield* Effect.gen(function* () {
      const api = yield* ReportsApi.ReportsApi;
      const missingKey = yield* api.connection("no-key").pipe(Effect.flip);
      assert.equal(missingKey.message.includes("API key connected"), true);
      const missingDomain = yield* api.connection("missing-domain").pipe(Effect.flip);
      assert.equal(missingDomain.message.includes("domain could not be found"), true);
      authStatus = 503;
      const failedAuth = yield* api.connection("b").pipe(Effect.flip);
      assert.equal(failedAuth.message.includes("HTTP 503"), true);
      assert.equal(failedAuth.message.includes(key), false);
      authStatus = -1;
      const offline = yield* api.connection("b").pipe(Effect.flip);
      assert.equal(offline.message.includes("Could not reach"), true);
      authStatus = 200;
      assert.equal(yield* Effect.isFailure(api.get("a", "/v2/amicited/good", {})), true);
      assert.equal(
        requests.some((url) => url.pathname === "/v2/amicited/good"),
        false,
      );
      catalogAvailable = true;
      assert.equal(
        yield* Effect.isFailure(api.get("a", "/v2/amicited/good", { domain_ids: "other" })),
        true,
      );
      assert.equal(yield* Effect.isFailure(api.get("a", "/v2/amicited/domains", {})), true);
      assert.equal(yield* Effect.isFailure(api.get("a", "/v2/amicited/global", {})), true);
      assert.equal(yield* Effect.isFailure(api.get("a", "/v2/amicited/path-param", {})), true);
      const embeddedLogo =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZxcAAAAASUVORK5CYII=";
      assert.deepEqual(yield* api.branding("a", embeddedLogo), {
        domain: "example.com",
        logoDataUrl: embeddedLogo,
      });
      for (const [mime, bytes] of [
        ["jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
        ["gif", Buffer.from("GIF89a")],
        ["webp", Buffer.from("RIFF0000WEBP")],
      ] as const) {
        const logo = `data:image/${mime};base64,${bytes.toString("base64")}`;
        assert.deepEqual(yield* api.branding("a", logo), {
          domain: "example.com",
          logoDataUrl: logo,
        });
      }
      for (const logo of [
        "data:image/png;base64,not-valid!",
        `data:image/jpeg;base64,${embeddedLogo.split(",")[1]}`,
        `data:image/png;base64,${Buffer.alloc(256 * 1024 + 1).toString("base64")}`,
        "data:image/svg+xml;base64,PHN2Zy8+",
      ])
        assert.deepEqual(yield* api.branding("a", logo), { domain: "example.com" });
      const previousDispatcher = getGlobalDispatcher();
      const mock = new MockAgent();
      mock.disableNetConnect();
      mock
        .get("https://127.0.0.1")
        .intercept({ path: "/private.png", method: "GET" })
        .reply(200, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      yield* Effect.acquireUseRelease(
        Effect.sync(() => setGlobalDispatcher(mock)),
        () =>
          Effect.gen(function* () {
            assert.deepEqual(yield* api.branding("a", "https://127.0.0.1/private.png"), {
              domain: "example.com",
            });
            assert.equal(mock.pendingInterceptors().length, 1);
          }),
        () =>
          Effect.promise(async () => {
            setGlobalDispatcher(previousDispatcher);
            await mock.close();
          }),
      );
      const reports = yield* Reports.Reports;
      const r = yield* reports.create({ projectId: "a", title: "Report" });
      yield* reports.update({
        id: r.id,
        spec: {
          ...r.spec,
          theme: { ...r.spec.theme, logo: embeddedLogo },
          pages: [{ blocks: [{ type: "table", data: "good", columns: [{ field: "value" }] }] }],
          queries: {
            good: {
              path: "/v2/amicited/good",
            },
            bad: { path: "/v2/amicited/failure" },
            duplicate: { path: "/v2/amicited/good" },
          },
        },
      });
      const s = yield* reports.run(r.id);
      assert.equal(s.status, "partial");
      assert.equal(requests.filter((url) => url.pathname === "/v2/amicited/good").length, 1);
      assert.equal(s.errors.bad?.includes("HTTP 500"), true);
      assert.equal(s.errors.bad?.includes("[redacted]"), true);
      assert.equal(JSON.stringify(s).includes(key), false);
      const sql = yield* SqlClient.SqlClient;
      assert.equal(
        JSON.stringify(
          yield* sql`SELECT render_context_json FROM amicited_report_snapshots`,
        ).includes(embeddedLogo),
        true,
      );
      assert.equal(
        JSON.stringify(yield* sql`SELECT * FROM amicited_report_snapshots`).includes(key),
        false,
      );
      const result = yield* reports.validate(r.id, "a");
      assert.equal(JSON.stringify(result).includes(key), false);
      const callsAfterSave = requests.filter((url) => url.pathname === "/v2/amicited/good").length;
      yield* reports.html(r.id, "preview");
      assert.equal(
        requests.filter((url) => url.pathname === "/v2/amicited/good").length,
        callsAfterSave,
      );
      for (const url of requests.filter(
        (url) =>
          url.pathname.startsWith("/v2/amicited/") && url.pathname !== "/v2/amicited/domains",
      )) {
        assert.equal(url.searchParams.get("workspace_id"), "ws");
        assert.equal(url.searchParams.get("domain_id"), "domain");
      }
    }).pipe(
      Effect.provide(
        Reports.layer.pipe(
          Layer.provideMerge(ReportsApi.layer),
          Layer.provideMerge(NodeSqliteClient.layer({ filename: ":memory:" })),
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(AmicitedCloud, cloud),
              ConfigProvider.layer(
                ConfigProvider.fromEnv({
                  env: { T3CODE_DEV_AMICITED_REST_URL: `http://127.0.0.1:${address.port}` },
                }),
              ),
              NodeCrypto.layer,
              ServerConfig.layerTest(process.cwd(), { prefix: "reports-api-" }).pipe(
                Layer.provide(NodeServices.layer),
              ),
              NodeServices.layer,
            ),
          ),
        ),
      ),
    );
  }).pipe(Effect.scoped),
);

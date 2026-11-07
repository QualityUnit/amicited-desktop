import * as NodeHttp from "node:http";
import * as NodeCrypto from "node:crypto";
import { expect, it } from "vite-plus/test";
import { CloudClient, errorState } from "./index.ts";
async function fixture() {
  let stored: string | undefined;
  let refusal = "";
  let challenge = "";
  let refreshed = false;
  const calls: string[] = [];
  let origin = "";
  const server = NodeHttp.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", origin);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString();
    const json = (value: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource"))
      return json({ resource: origin + "/mcp", authorization_servers: [origin] });
    if (url.pathname.startsWith("/.well-known/"))
      return json({
        issuer: origin,
        authorization_endpoint: origin + "/authorize",
        token_endpoint: origin + "/token",
        registration_endpoint: origin + "/register",
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    if (url.pathname === "/register")
      return json({ ...JSON.parse(body), client_id: "native-client" }, 201);
    if (url.pathname === "/token") {
      const params = new URLSearchParams(body);
      if (params.get("grant_type") === "refresh_token") refreshed = true;
      else if (
        NodeCrypto.createHash("sha256")
          .update(params.get("code_verifier") ?? "")
          .digest("base64url") !== challenge
      )
        return json({ error: "invalid_grant" }, 400);
      return json({
        access_token: "oauth-token",
        token_type: "Bearer",
        refresh_token: "refresh",
        expires_in: 3600,
        scope: "amicited:read amicited:write",
      });
    }
    if (url.pathname !== "/mcp") return json({}, 404);
    if (!req.headers.authorization) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      );
      return json({}, 401);
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const rpc = JSON.parse(body);
    if (rpc.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    let result: unknown = {};
    if (rpc.method === "initialize")
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    if (rpc.method === "tools/call") {
      calls.push(rpc.params.name);
      result = {
        content: [
          {
            type: "text",
            text:
              refusal ||
              JSON.stringify(
                rpc.params.name === "prompt_analytics"
                  ? { visibility: 23, citations: 7 }
                  : rpc.params.name === "report_link"
                    ? { url: "https://app.flowhunt.io/reports/test" }
                    : { domains: [{ id: "domain-1", name: "example.com" }] },
              ),
          },
        ],
        ...(refusal ? { isError: true } : {}),
      };
    }
    json({ jsonrpc: "2.0", id: rpc.id, result });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  origin = `http://127.0.0.1:${address.port}`;
  return {
    make(openExternal?: (url: string) => Promise<void>) {
      return new CloudClient({
        endpoint: origin + "/mcp",
        secrets: {
          read: async () => stored,
          write: async (value) => {
            stored = value;
          },
          clear: async () => {
            stored = undefined;
          },
        },
        openExternal:
          openExternal ??
          (async (value) => {
            const url = new URL(value);
            challenge = url.searchParams.get("code_challenge") ?? "";
            const callback = new URL(url.searchParams.get("redirect_uri")!);
            callback.searchParams.set("code", "fixture-code");
            callback.searchParams.set("state", url.searchParams.get("state")!);
            const wrongState = new URL(callback);
            wrongState.searchParams.set("state", "wrong");
            expect((await fetch(wrongState)).status).toBe(400);
            await fetch(callback);
          }),
      });
    },
    calls,
    get stored() {
      return stored;
    },
    get refreshed() {
      return refreshed;
    },
    expire() {
      const credential = JSON.parse(stored!);
      credential.expiresAt = 1;
      stored = JSON.stringify(credential);
    },
    refuse(message: string) {
      refusal = message;
    },
    async [Symbol.asyncDispose]() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
it("initializes MCP, validates keys, keeps them out of status, restores and clears credentials", async () => {
  await using fake = await fixture();
  const cloud = fake.make();
  expect(await cloud.status()).toEqual({ state: "disconnected" });
  expect(await cloud.connectionForRequest("citations", true, true)).toMatchObject({
    state: "disconnected",
    action: "Connect AmICited",
    missing: expect.stringContaining("Connecting AmICited is free"),
  });
  expect(await cloud.connectionForRequest("citations", false, true)).toMatchObject({
    state: "hidden",
    instruction: expect.stringContaining("Do not suggest"),
  });
  expect(await cloud.connectionForRequest("citations", true, false)).not.toHaveProperty("action");
  expect((await cloud.connectApiKey("test-key")).state).toBe("connected");
  expect(JSON.stringify(await cloud.status())).not.toContain("test-key");
  expect(await cloud.connectionForRequest("citations", false, true)).toMatchObject({
    state: "connected",
    tools: ["amicited_cloud_read", "amicited_cloud_run"],
    readTools: expect.arrayContaining(["prompt_analytics", "search_tools"]),
  });
  expect((await fake.make().status()).state).toBe("connected");
  await cloud.promptAnalytics("domain-1");
  await cloud.reportLink({ domain_id: "domain-1" });
  expect(await cloud.summary()).toMatchObject({
    domains: [{ id: "domain-1", name: "example.com" }],
    headlines: [
      { label: "example.com · Visibility", value: 23 },
      { label: "example.com · Citations", value: 7 },
    ],
    reportUrl: "https://app.flowhunt.io/reports/test",
  });
  expect(fake.calls).toContain("prompt_analytics");
  expect(fake.calls).toContain("report_link");
  expect(await cloud.disconnect()).toEqual({ state: "disconnected" });
  expect(fake.stored).toBeUndefined();
});
it("discovers OAuth, uses state and PKCE, persists and refreshes without exposing tokens", async () => {
  await using fake = await fixture();
  const cloud = fake.make();
  expect(await cloud.connectOAuth()).toMatchObject({
    state: "connected",
    scopes: ["amicited:read", "amicited:write"],
  });
  expect(fake.stored).toContain("refresh");
  fake.expire();
  expect((await fake.make().status()).state).toBe("connected");
  expect(fake.refreshed).toBe(true);
});
it("maps refused tools to honest actionable states without saving rejected keys", async () => {
  await using fake = await fixture();
  const cloud = fake.make();
  for (const [message, kind] of [
    ["requires a Pro plan or above", "plan_required"],
    ["zero credit balance", "no_credits"],
    ["429 rate limited", "rate_limited"],
    ["401 unauthorized", "auth"],
  ]) {
    fake.refuse(message!);
    expect(await cloud.connectApiKey("secret")).toMatchObject({ state: "error", kind });
    expect(fake.stored).toBeUndefined();
  }
  expect(errorState(new Error("DNS failed"))).toMatchObject({ kind: "network" });
});
it("disconnect cancels browser sign-in and ignores later callbacks", async () => {
  await using fake = await fixture();
  let opened!: () => void;
  const browserOpened = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const cloud = fake.make(async () => {
    opened();
  });
  const connecting = cloud.connectOAuth();
  await browserOpened;
  expect(await cloud.disconnect()).toEqual({ state: "disconnected" });
  expect(await connecting).toEqual({ state: "disconnected" });
  expect(fake.stored).toBeUndefined();
});

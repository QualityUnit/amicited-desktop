import * as NodeHttp from "node:http";
import * as NodeCrypto from "node:crypto";
import { expect, it, vi } from "vite-plus/test";
import { MCP_URL, CloudClient, errorState, cloudAction } from "./index.ts";
async function fixture() {
  let stored: string | undefined;
  let refusal = "";
  let challenge = "";
  let refreshed = false;
  let registeredScope = "";
  const calls: string[] = [];
  let initializations = 0;
  let listings = 0;
  const argumentsByTool: Record<string, unknown> = {};
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
      return json({ resource: origin + "/mcp/amicited", authorization_servers: [origin] });
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
    if (url.pathname === "/register") {
      registeredScope = JSON.parse(body).scope;
      return json({ ...JSON.parse(body), client_id: "native-client" }, 201);
    }
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
    if (url.pathname !== "/mcp/amicited") return json({}, 404);
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
    if (rpc.method === "initialize") {
      initializations++;
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    }
    if (rpc.method === "tools/list") {
      listings++;
      result = {
        tools: [
          {
            name: "free_site_health_get",
            inputSchema: { type: "object" },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          {
            name: "free_site_health_start",
            inputSchema: { type: "object" },
            annotations: { readOnlyHint: false, destructiveHint: false },
          },
          { name: "unknown_annotations", inputSchema: { type: "object" } },
          {
            name: "contradictory",
            inputSchema: { type: "object" },
            annotations: { readOnlyHint: true, destructiveHint: true },
          },
        ],
      };
    }
    if (rpc.method === "tools/call") {
      argumentsByTool[rpc.params.name] = rpc.params.arguments;
      calls.push(rpc.params.name);
      result = {
        content: [
          {
            type: "text",
            text:
              refusal ||
              JSON.stringify(
                rpc.params.name === "list_prompts"
                  ? {
                      prompts: [
                        {
                          prompt_id: "3f9c0000-0000-4000-8000-000000000001",
                          domain_id: "domain-1",
                          content: "Brand recommendations",
                          tag_id: null,
                          country: null,
                          status: "active",
                          schedule: "daily",
                          providers: null,
                          created_at: "2026-11-07T00:00:00Z",
                          updated_at: "2026-11-07T00:00:00Z",
                        },
                      ],
                      count: 1,
                    }
                  : rpc.params.name === "prompt_analytics"
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
        endpoint: origin + "/mcp/amicited",
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
    get registeredScope() {
      return registeredScope;
    },
    calls,
    argumentsByTool,
    get listings() {
      return listings;
    },
    get initializations() {
      return initializations;
    },
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
    access: "unknown",
    tools: ["amicited_cloud_discover", "amicited_cloud_call"],
  });
  expect((await fake.make().status()).state).toBe("connected");
  expect(await cloud.summary()).toMatchObject({ connection: { state: "connected" } });
  await cloud.call("free_site_health_get", { run_id: "report-1" });
  expect(fake.argumentsByTool.free_site_health_get).toEqual({ run_id: "report-1" });
  expect(await cloud.toolPolicy("free_site_health_get")).toMatchObject({ needsApproval: false });
  for (const name of ["free_site_health_start", "unknown_annotations", "contradictory"])
    expect(await cloud.toolPolicy(name)).toMatchObject({ needsApproval: true });
  expect(fake.listings).toBe(1);
  expect(fake.initializations).toBe(2); // One restored client and the original reused session.
  expect(fake.calls.filter((name) => name === "list_toolsets")).toHaveLength(2);
  expect(fake.calls).not.toContain("list_domains");
  fake.refuse("requires a Pro plan or above");
  expect(await cloud.call("list_domains")).toMatchObject({
    isError: true,
    structuredContent: { kind: "amicited-upgrade" },
  });
  expect(await cloud.status()).toMatchObject({ state: "connected", access: "free" });
  expect(fake.stored).toContain("test-key");
  fake.refuse("");
  await cloud.call("list_domains");
  expect(await cloud.status()).toMatchObject({ state: "connected", access: "full" });
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
  let redirect = "";
  let opened!: () => void;
  const browserOpened = new Promise<void>((resolve) => {
    opened = resolve;
  });
  const cloud = fake.make(async (value) => {
    const url = new URL(value);
    expect(url.searchParams.get("app")).toBe("amicited");
    expect(url.searchParams.get("scope")).toContain("amicited:spending");
    redirect = url.searchParams.get("redirect_uri")!;
    opened();
  });
  const connecting = cloud.connectOAuth();
  await browserOpened;
  expect(await cloud.disconnect()).toEqual({ state: "disconnected" });
  expect(await connecting).toEqual({ state: "disconnected" });
  await expect(fetch(redirect)).rejects.toThrow();
  expect(fake.stored).toBeUndefined();
});

it("preserves the connection and original tool failures, then runs free tools", async () => {
  await using fake = await fixture();
  const cloud = fake.make();
  await cloud.connectApiKey("test-key");
  for (const [message, code] of [
    ["Invalid arguments: url is required", "invalid_request"],
    ["Hourly rate limit exceeded", "rate_limited"],
    ["Insufficient credits", "no_credits"],
    ["Missing scope amicited:write. Re-authenticate with this scope", "scope_missing"],
    ["Domain not found", "not_found"],
  ]) {
    fake.refuse(message!);
    expect(await cloud.call("free_site_health_start")).toMatchObject({
      isError: true,
      structuredContent: { code, message },
    });
    expect(await cloud.status()).toMatchObject({ state: "connected" });
    fake.refuse("");
    expect(await cloud.call("free_site_health_get", { run_id: "run-1" })).not.toHaveProperty(
      "isError",
      true,
    );
  }
  await cloud.disconnect();
});

it("keeps one call waiting for app approval and scopes free grants to a thread", async () => {
  await using fake = await fixture();
  const cloud = fake.make();
  await cloud.connectApiKey("test-key");
  let policyDone = Promise.withResolvers<void>();
  const unsubscribe = cloud.subscribeApprovals(() => {
    if (cloud.pendingApprovals().length) policyDone.resolve();
  });
  const pending = cloud.requestCall("thread-1", "contradictory", {});
  await policyDone.promise;
  const requestId = cloud.pendingApprovals()[0]!.requestId;
  expect(fake.calls).not.toContain("contradictory");
  await cloud.answerApproval(requestId, "accept");
  expect(await pending).toHaveProperty("content");
  await expect(cloud.answerApproval(requestId, "accept")).rejects.toThrow("no longer pending");
  expect(fake.calls.filter((name) => name === "contradictory")).toHaveLength(1);
  policyDone = Promise.withResolvers<void>();
  const free = cloud.requestCall("thread-1", "free_site_health_start", {
    request: { target: "example.com" },
  });
  await policyDone.promise;
  await cloud.answerApproval(cloud.pendingApprovals()[0]!.requestId, "acceptForSession");
  await free;
  await cloud.requestCall("thread-1", "free_site_health_start", {
    request: { target: "other.example" },
  });
  expect(fake.calls.filter((name) => name === "free_site_health_start")).toHaveLength(2);
  policyDone = Promise.withResolvers<void>();
  const other = cloud.requestCall("thread-2", "free_site_health_start", {});
  await policyDone.promise;
  await cloud.answerApproval(cloud.pendingApprovals()[0]!.requestId, "decline");
  expect(await other).toMatchObject({
    isError: true,
    content: [{ text: expect.stringContaining("user declined") }],
  });
  expect(fake.calls.filter((name) => name === "free_site_health_start")).toHaveLength(2);
  policyDone = Promise.withResolvers<void>();
  const restarting = cloud.requestCall("thread-1", "contradictory", { restart: true });
  await policyDone.promise;
  const staleRequest = cloud.pendingApprovals()[0]!.requestId;
  await cloud.close();
  expect(await restarting).toMatchObject({ isError: true });
  expect(fake.calls.filter((name) => name === "contradictory")).toHaveLength(1);
  const restored = fake.make();
  expect(await restored.status()).toMatchObject({ state: "connected" });
  await expect(restored.answerApproval(staleRequest, "accept")).rejects.toThrow(
    "no longer pending",
  );
  unsubscribe();
  await restored.disconnect();
});

it("expires and cancels pending calls without executing, including destructive free tools after a grant", async () => {
  using _timers = { [Symbol.dispose]: () => vi.useRealTimers() };
  vi.useFakeTimers();
  const cloud = new CloudClient({
    secrets: { read: async () => undefined, write: async () => {}, clear: async () => {} },
    openExternal: async () => {},
  });
  const policy = Promise.resolve({ needsApproval: true, destructive: false });
  cloud.toolPolicy = () => policy;
  const call = vi.spyOn(cloud, "call").mockResolvedValue({ content: [] });
  const timed = cloud.requestCall("thread", "paid_tool", {});
  await policy;
  const staleId = cloud.pendingApprovals()[0]!.requestId;
  await vi.advanceTimersByTimeAsync(10 * 60_000);
  expect(await timed).toMatchObject({
    isError: true,
    content: [{ text: expect.stringContaining("timed out") }],
  });
  await expect(cloud.answerApproval(staleId, "accept")).rejects.toThrow("no longer pending");
  const granted = cloud.requestCall("thread", "free_site_health_start", {});
  await policy;
  await cloud.answerApproval(cloud.pendingApprovals()[0]!.requestId, "acceptForSession");
  await granted;
  call.mockClear();
  const destructive = Promise.resolve({ needsApproval: true, destructive: true });
  cloud.toolPolicy = () => destructive;
  const controller = new AbortController();
  const waiting = cloud.requestCall("thread", "free_site_health_start", {}, controller.signal);
  await destructive;
  expect(cloud.pendingApprovals()).toHaveLength(1);
  expect(call).not.toHaveBeenCalled();
  controller.abort();
  expect(await waiting).toMatchObject({ isError: true });
  expect(cloud.pendingApprovals()).toEqual([]);
  const cancelled = cloud.requestCall("thread", "paid_tool", {});
  await destructive;
  await cloud.disconnect();
  expect(await cancelled).toMatchObject({ isError: true });
  expect(call).not.toHaveBeenCalled();
});

it("cancels discovery and immediately reconnects without opening the stale browser", async () => {
  await using fake = await fixture();
  const discovery = Promise.withResolvers<void>();
  const nativeFetch = globalThis.fetch;
  let blocked = false;
  using _fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (!blocked && String(url).includes(".well-known")) {
      blocked = true;
      discovery.resolve();
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        });
      });
    }
    return nativeFetch(url, init);
  });
  const opened = Promise.withResolvers<void>();
  const open = vi.fn(async () => {
    opened.resolve();
  });
  const cloud = fake.make(open);
  const first = cloud.connectOAuth();
  await discovery.promise;
  await cloud.disconnect();
  const second = cloud.connectOAuth();
  await first;
  await opened.promise;
  expect(open).toHaveBeenCalledTimes(1);
  await cloud.disconnect();
  expect(await second).toEqual({ state: "disconnected" });
  expect(fake.stored).toBeUndefined();
});

it("grants paid reads per chat, always asks for writes, and refuses known free access before approval", async () => {
  await using fake = await fixture();
  const cloud = fake.make();
  await cloud.connectApiKey("test-key");
  cloud.toolPolicy = async () => ({ needsApproval: false, destructive: false });
  let waiting = Promise.withResolvers<void>();
  const stop = cloud.subscribeApprovals(() => {
    if (cloud.pendingApprovals().length) waiting.resolve();
  });
  const call = cloud.requestCall("thread", "paid_read", { website: "acme.com" });
  await waiting.promise;
  expect(cloud.pendingApprovals()[0]).toMatchObject({
    readOnly: true,
    message: expect.stringContaining("acme.com"),
  });
  await cloud.answerApproval(cloud.pendingApprovals()[0]!.requestId, "acceptForSession");
  await call;
  await cloud.requestCall("thread", "paid_read", {});
  expect(cloud.pendingApprovals()).toEqual([]);
  cloud.toolPolicy = async () => ({ needsApproval: true, destructive: false });
  waiting = Promise.withResolvers<void>();
  const write = cloud.requestCall("thread", "paid_write", {});
  await waiting.promise;
  await cloud.answerApproval(cloud.pendingApprovals()[0]!.requestId, "decline");
  await write;
  fake.refuse("Pro plan required");
  await cloud.call("paid_read");
  expect(await cloud.requestCall("thread", "paid_write", {})).toMatchObject({
    isError: true,
    structuredContent: { code: "plan_required" },
  });
  expect(cloud.pendingApprovals()).toEqual([]);
  fake.refuse("");
  cloud.resetAccess();
  cloud.toolPolicy = async () => ({ needsApproval: false, destructive: false });
  expect(await cloud.requestCall("thread", "paid_read", {})).not.toHaveProperty("isError", true);
  expect((await cloud.status()).state).toBe("connected");
  stop();
  await cloud.disconnect();
});

it("cancels during final MCP validation and never publishes the stale session", async () => {
  await using fake = await fixture();
  const validating = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  const nativeFetch = globalThis.fetch;
  using _fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (typeof init?.body === "string" && init.body.includes('"name":"list_toolsets"')) {
      validating.resolve();
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => {
            aborted.resolve();
            reject(new Error("cancelled"));
          },
          { once: true },
        );
      });
    }
    return nativeFetch(url, init);
  });
  const cloud = fake.make();
  const connecting = cloud.connectOAuth();
  await validating.promise;
  expect(await cloud.disconnect()).toEqual({ state: "disconnected" });
  await aborted.promise;
  expect(await connecting).toEqual({ state: "disconnected" });
  expect(fake.stored).toBeUndefined();
  expect(await cloud.status()).toEqual({ state: "disconnected" });
});

it("names paid actions and resolves resources learned in the same chat", async () => {
  await using fake = await fixture();
  const cloud = fake.make();
  await cloud.connectApiKey("key");
  cloud.toolPolicy = async () => ({ needsApproval: false, destructive: false });
  let waiting = Promise.withResolvers<void>();
  const stop = cloud.subscribeApprovals(() => {
    if (cloud.pendingApprovals().length) waiting.resolve();
  });
  const domains = cloud.requestCall("thread", "list_domains", {});
  await waiting.promise;
  await cloud.answerApproval(cloud.pendingApprovals()[0]!.requestId, "acceptForSession");
  await domains;
  await cloud.requestCall("thread", "list_prompts", { domain_id: "domain-1" });
  expect(
    cloud.target("thread", "prompt_analytics", {
      domain_id: "domain-1",
      prompt_id: "3f9c0000-0000-4000-8000-000000000001",
    }),
  ).toBe(" on example.com / Brand recommendations");
  expect(
    cloudAction("free_site_health_start", { request: { target: "https://example.com/path" } }),
  ).toBe("Check site health on example.com");
  cloud.toolPolicy = async () => ({ needsApproval: true, destructive: true });
  waiting = Promise.withResolvers<void>();
  const deletion = cloud.requestCall("thread", "delete_prompt", {
    domain_id: "domain-1",
    prompt_id: "3f9c0000-0000-4000-8000-000000000001",
  });
  await waiting.promise;
  expect(cloud.pendingApprovals()[0]!.message).toContain(
    "Delete prompt on example.com / Brand recommendations",
  );
  await cloud.answerApproval(cloud.pendingApprovals()[0]!.requestId, "decline");
  await deletion;
  expect(cloudAction("list_domains", {})).toBe("View domains");
  expect(cloudAction("get_brand_report", {})).toBe("View brand report");
  expect(cloudAction("create_prompts", {}, false)).toBe("Change prompts");
  stop();
  await cloud.disconnect();
});

it.each([
  ["invalid_request", "Please choose a workspace for this authorization."],
  ["invalid_target", "Only one resource may be requested."],
  ["invalid_scope", "Scopes for another MCP endpoint cannot be granted for this resource."],
  ["access_denied", "You must belong to a workspace before authorizing third-party applications."],
  ["access_denied", "You do not have access to the workspace this application requested."],
  ["access_denied", "The user denied the request"],
  ["server_error", "Something went wrong"],
  ["unexpected_error", "Unexpected refusal <script>alert(1)</script>"],
  ["access_denied", "The user denied the request", true],
])(
  "preserves OAuth callback %s and its description",
  async (code, description, reconnect = false) => {
    await using fake = await fixture();
    const cloud = fake.make(async (value) => {
      const authorize = new URL(value);
      const callback = new URL(authorize.searchParams.get("redirect_uri")!);
      callback.searchParams.set("state", authorize.searchParams.get("state")!);
      callback.searchParams.set("error", code);
      callback.searchParams.set("error_description", description);
      const response = await fetch(callback);
      expect(response.headers.get("content-type")).toContain("text/plain");
      expect(await response.text()).toContain(description);
    });
    if (reconnect) {
      expect(await cloud.connectApiKey("existing-key")).toMatchObject({ state: "connected" });
      expect(await cloud.connectOAuth()).toMatchObject({ state: "connected" });
      expect(await cloud.status()).toMatchObject({ state: "connected" });
      expect(fake.stored).toContain("existing-key");
      await cloud.disconnect();
      return;
    }
    expect(await cloud.connectOAuth()).toMatchObject({
      state: "error",
      kind: "auth",
      code,
      description,
    });
    expect(await cloud.status()).toMatchObject({ code, description });
    expect(fake.stored).toBeUndefined();
  },
);

it("builds an authorization request satisfying FlowHunt resource, registration and PKCE checks", async () => {
  // FlowHunt mcp_resources.py:174-182 and oauth_services.py:62-74, 298-331.
  const constraints = {
    resource: "https://api.flowhunt.io/mcp/amicited",
    scopes: ["amicited:read", "amicited:write", "amicited:spending"],
    method: "S256",
  };
  expect(MCP_URL).toBe(constraints.resource);
  await using fake = await fixture();
  const cloud = fake.make(async (value) => {
    const url = new URL(value);
    const params = url.searchParams;
    const resource = new URL(params.get("resource")!);
    expect(new URL(resource.pathname, MCP_URL).href).toBe(constraints.resource);
    expect(params.getAll("resource")).toHaveLength(1);
    expect(params.get("scope")?.split(" ")).toEqual(constraints.scopes);
    expect(fake.registeredScope.split(" ")).toEqual(constraints.scopes);
    expect(params.get("app")).toBe("amicited");
    expect(params.get("response_type")).toBe("code");
    expect(params.get("code_challenge_method")).toBe(constraints.method);
    expect(params.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(params.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const callback = new URL(params.get("redirect_uri")!);
    expect(callback.hostname).toBe("127.0.0.1");
    callback.searchParams.set("state", params.get("state")!);
    callback.searchParams.set("error", "access_denied");
    await fetch(callback);
  });
  expect(await cloud.connectOAuth()).toMatchObject({ state: "error", code: "access_denied" });
});

it("runs free checks, paid reads and writes in full access but confirms every destructive call", async () => {
  await using fake = await fixture();
  const cloud = fake.make();
  await cloud.connectApiKey("key");
  cloud.toolPolicy = async (name) => ({ needsApproval: name !== "paid_read", destructive: false });
  for (const tool of ["free_site_health_start", "paid_read", "paid_write"]) {
    expect(
      await cloud.requestCall("thread", tool, {}, undefined, "full-access"),
    ).not.toHaveProperty("isError", true);
    expect(cloud.pendingApprovals()).toEqual([]);
    expect(fake.calls).toContain(tool);
  }
  cloud.toolPolicy = async () => ({ needsApproval: true, destructive: true });
  for (const decision of ["acceptForSession", "decline"] as const) {
    const waiting = Promise.withResolvers<void>();
    const stop = cloud.subscribeApprovals(() => {
      if (cloud.pendingApprovals().length) waiting.resolve();
    });
    const call = cloud.requestCall("thread", "delete_prompt", {}, undefined, "full-access");
    await waiting.promise;
    expect(cloud.pendingApprovals()).toHaveLength(1);
    expect(cloud.pendingApprovals()[0]!.message).not.toContain("credits");
    await cloud.answerApproval(cloud.pendingApprovals()[0]!.requestId, decision);
    const result = await call;
    expect(result.isError === true).toBe(decision === "decline");
    stop();
  }
  expect(fake.calls.filter((name) => name === "delete_prompt")).toHaveLength(1);
});

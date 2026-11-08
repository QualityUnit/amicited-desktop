import { threadsForDomain } from "./domainModel.ts";
import * as NodeHttp from "node:http";
import { expect, it } from "vite-plus/test";
import { CloudClient, type SecretStorage } from "./index.ts";
import { DomainConnections, normalizeDomain, type Domain } from "./domains.ts";
function fixture(endpoint?: string) {
  const secrets = new Map<string, string>();
  let rows: Domain[] = [];
  let migrated = false;
  const storage = (id: string): SecretStorage => ({
    read: async () => secrets.get(id),
    write: async (value) => {
      secrets.set(id, value);
    },
    clear: async () => {
      secrets.delete(id);
    },
  });
  const options: ConstructorParameters<typeof DomainConnections>[0] = {
    read: async () => rows,
    write: async (value) => {
      rows = value;
    },
    secrets: storage,
    legacy: storage("legacy"),
    migration: {
      complete: async () => migrated,
      finish: async () => {
        migrated = true;
      },
    },
    changed: () => {},
    client: (secrets) =>
      new CloudClient({ secrets, ...(endpoint ? { endpoint } : {}), openExternal: async () => {} }),
  };
  const domains = new DomainConnections(options);
  return { secrets, domains, storage, restart: () => new DomainConnections(options) };
}
it("normalizes website paths, ports, case and www to one hostname", () => {
  expect(normalizeDomain("https://WWW.Acme.com:8443/about?q=yes")).toEqual({
    hostname: "acme.com",
    brand: "acme",
  });
  expect(normalizeDomain("acme.com", " ACME ")).toEqual({ hostname: "acme.com", brand: "ACME" });
  for (const value of ["file://acme.com", "localhost", "https://user:pass@acme.com"])
    expect(() => normalizeDomain(value)).toThrow();
});
it("isolates credentials and client sessions by project", async () => {
  const f = fixture();
  await f.domains.register("a", "a.example");
  await f.domains.register("b", "b.example");
  f.secrets.set("a", JSON.stringify({ apiKey: "account-a" }));
  expect(f.domains.client("a")).not.toBe(f.domains.client("b"));
  expect(await f.domains.client("b").status()).toEqual({ state: "disconnected" });
  await f.domains.client("b").disconnect();
  expect(await f.storage("a").read()).toBe(JSON.stringify({ apiKey: "account-a" }));
  expect(await f.domains.client("unregistered").status()).toEqual({ state: "disconnected" });
});
it("moves the legacy connection only to the first domain and survives a restart", async () => {
  const f = fixture();
  const credential = JSON.stringify({ apiKey: "legacy-key" });
  f.secrets.set("legacy", credential);
  const root = new CloudClient({ secrets: f.storage("legacy"), openExternal: async () => {} });
  root.domains = f.domains;
  expect(await root.forProject(undefined).status()).toEqual({ state: "disconnected" });
  await Promise.all([f.domains.register("a", "a.example"), f.domains.register("b", "b.example")]);
  expect(f.secrets.get("a")).toBe(credential);
  expect(f.secrets.has("legacy")).toBe(false);
  expect(f.secrets.has("b")).toBe(false);
  expect((await f.domains.list()).map((row) => row.projectId)).toEqual(["a", "b"]);
});
it("remembers a domain id only from the matching domain's approved discovery result", async () => {
  const f = fixture();
  await f.domains.register("a", "a.example");
  await f.domains.register("b", "b.example");
  await f.domains.rememberDomain("a", {
    content: [
      {
        text: JSON.stringify({
          domains: [
            { domain_id: "remote-b", domain_name: "b.example" },
            { domain_id: "remote-a", domain_name: "a.example" },
          ],
        }),
      },
    ],
  });
  await f.domains.rememberDomain("b", { name: "b.example", id: "unrelated" });
  expect((await f.domains.list()).map((row) => row.domainId)).toEqual(["remote-a", undefined]);
});

it("sends each domain's own bearer credential and keeps account reuse reversible", async () => {
  const calls: Array<{ tool: string; authorization: string | undefined }> = [];
  let refuse = false;
  const server = NodeHttp.createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const rpc = JSON.parse(Buffer.concat(chunks).toString());
    if (rpc.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    let result: unknown = {};
    if (rpc.method === "initialize")
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    if (rpc.method === "tools/list") result = { tools: [] };
    if (rpc.method === "tools/call") {
      calls.push({ tool: rpc.params.name, authorization: request.headers.authorization });
      result = {
        content: [{ type: "text", text: refuse ? "Pro plan required" : "{}" }],
        ...(refuse ? { isError: true } : {}),
      };
    }
    response
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No fixture port");
  const f = fixture(`http://127.0.0.1:${address.port}/mcp`);
  try {
    await f.domains.register("a", "a.example");
    await f.domains.register("b", "b.example");
    await f.domains.client("a").connectApiKey("key-a");
    await f.domains.client("b").connectApiKey("key-b");
    await f.domains.client("a").call("probe-a");
    await f.domains.client("b").call("probe-b");
    expect(calls.filter((call) => call.tool.startsWith("probe"))).toEqual([
      { tool: "probe-a", authorization: "Bearer key-a" },
      { tool: "probe-b", authorization: "Bearer key-b" },
    ]);
    const root = new CloudClient({ secrets: f.storage("legacy"), openExternal: async () => {} });
    root.domains = f.domains;
    const a = root.forProject("a");
    a.toolPolicy = async () => ({ needsApproval: false, destructive: false });
    const waiting = Promise.withResolvers<void>();
    const stop = a.subscribeApprovals(() => {
      if (a.pendingApprovals().length) waiting.resolve();
    });
    const first = a.requestCall("thread-a", "paid-read", {});
    await waiting.promise;
    await a.answerApproval(a.pendingApprovals()[0]!.requestId, "acceptForSession");
    await first;
    stop();
    refuse = true;
    await a.call("paid-read");
    expect(await a.requestCall("thread-a", "paid-read", {})).toMatchObject({
      structuredContent: { code: "plan_required" },
    });
    refuse = false;
    root.forProject("a").resetAccess();
    expect(await a.requestCall("thread-a", "paid-read", {})).not.toHaveProperty("isError", true);
    expect(await a.status()).toMatchObject({ state: "connected", access: "full" });
    expect(await root.forProject("b").status()).toMatchObject({
      state: "connected",
      access: "full",
    });
    await f.domains.reuse("b", "a");
    expect(f.secrets.has("b")).toBe(false);
    expect(f.domains.client("b")).toBe(f.domains.client("a"));
    await f.domains.disconnect("b");
    expect(await f.domains.client("b").status()).toEqual({ state: "disconnected" });
    expect((await f.domains.client("a").status()).state).toBe("connected");
    await f.domains.reuse("b", "a");
    await f.domains.rememberDomain("b", {
      domains: [{ domain_id: "old-id", domain_name: "b.example" }],
    });
    const source = f.domains.client("a");
    const replacement = await f.domains.prepareConnection("b");
    expect(replacement).not.toBe(source);
    expect(
      (await f.domains.metadata()).find((row) => row.projectId === "b")?.domainId,
    ).toBeUndefined();
    expect((await source.status()).state).toBe("connected");
  } finally {
    await Promise.all(f.domains.allClients().map((client) => client.close()));
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it("groups threads under their domain and preserves unassigned and remote threads", () => {
  const domains = [{ projectId: "a" }, { projectId: "b" }];
  const threads = [
    { id: "first", projectId: "a", environmentId: "local" },
    { id: "second", projectId: "b", environmentId: "local" },
    { id: "scratch", projectId: "scratch", environmentId: "local" },
    { id: "remote", projectId: "a", environmentId: "remote" },
  ];
  expect(threadsForDomain(threads, domains, "local", "a").map((thread) => thread.id)).toEqual([
    "first",
  ]);
  expect(threadsForDomain(threads, domains, "local", "b").map((thread) => thread.id)).toEqual([
    "second",
  ]);
  expect(threadsForDomain(threads, domains, "local").map((thread) => thread.id)).toEqual([
    "scratch",
    "remote",
  ]);
});
it("removes a domain's metadata and private credential", async () => {
  const f = fixture();
  await f.domains.register("a", "a.example");
  await f.domains.register("b", "b.example");
  f.secrets.set("a", JSON.stringify({ apiKey: "key-a" }));
  f.secrets.set("b", JSON.stringify({ apiKey: "key-b" }));
  await f.domains.forget("a");
  expect((await f.domains.list()).map((row) => row.projectId)).toEqual(["b"]);
  expect(f.secrets.has("a")).toBe(false);
  expect(f.secrets.has("b")).toBe(true);
});
it("defaults local tool targets from the domain while preserving explicit targets", async () => {
  const { domainToolInput } = await import("./domainModel.ts");
  const domain = { hostname: "acme.com", brand: "Acme" };
  expect(domainToolInput("seo.site.audit", {}, domain)).toEqual({ url: "https://acme.com" });
  expect(domainToolInput("seo.ssl.check", {}, domain)).toEqual({ domain: "acme.com" });
  expect(domainToolInput("seo.site.audit", { url: "https://other.com" }, domain)).toEqual({
    url: "https://other.com",
  });
  expect(domainToolInput("content.readability", { text: "A draft" }, domain)).toEqual({
    text: "A draft",
  });
});
it("keeps local domain data available when secure credential migration fails", async () => {
  let rows: Domain[] = [];
  const domains = new DomainConnections({
    read: async () => rows,
    write: async (value) => {
      rows = value;
    },
    legacy: {
      read: async () => {
        throw new Error("Keyring unavailable");
      },
      write: async () => {},
      clear: async () => {},
    },
    secrets: () => ({ read: async () => undefined, write: async () => {}, clear: async () => {} }),
    client: (secrets) => new CloudClient({ secrets, openExternal: async () => {} }),
    changed: () => {},
  });
  await domains.register("a", "a.example");
  expect((await domains.metadata())[0]?.hostname).toBe("a.example");
  await expect(domains.list()).rejects.toThrow("Keyring unavailable");
});

it("does not move a developer connection after the one-time migration and restart", async () => {
  const f = fixture();
  f.secrets.set("legacy", JSON.stringify({ apiKey: "original" }));
  await f.domains.register("a", "a.example");
  f.secrets.set("legacy", JSON.stringify({ apiKey: "developer-account" }));
  const restarted = f.restart();
  expect(await restarted.metadata()).toEqual(await f.domains.metadata());
  await restarted.list();
  expect(f.secrets.get("legacy")).toBe(JSON.stringify({ apiKey: "developer-account" }));
  expect(f.secrets.get("a")).toBe(JSON.stringify({ apiKey: "original" }));
});
it("requires a registered domain before connecting and clears account-specific domain ids", async () => {
  const f = fixture();
  await expect(f.domains.prepareConnection("scratch")).rejects.toThrow("Add a domain");
  await f.domains.register("a", "a.example");
  await f.domains.rememberDomain("a", {
    domains: [{ domain_id: "old-account-id", domain_name: "a.example" }],
  });
  expect((await f.domains.metadata())[0]?.domainId).toBe("old-account-id");
  await f.domains.prepareConnection("a");
  expect((await f.domains.metadata())[0]?.domainId).toBeUndefined();
  await f.domains.rememberDomain("a", {
    domains: [{ domain_id: "another-id", domain_name: "a.example" }],
  });
  await f.domains.disconnect("a");
  expect((await f.domains.metadata())[0]?.domainId).toBeUndefined();
});

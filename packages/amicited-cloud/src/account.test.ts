import { formatPlanLabel, pluralize } from "./formatting.ts";
import { expect, it, vi } from "vite-plus/test";
import {
  AccountConnections,
  accountSignInEnabled,
  readAccountDomains,
  readAccountWorkspaces,
  workspaceName,
} from "./account.ts";
import { detectCountry } from "./tracking.ts";
import type { CloudClient } from "./index.ts";
import type { DomainConnections } from "./domains.ts";

const workspace = (id: string) => ({
  id,
  name: "Personal workspace",
  email: "a@gmail.com",
  userName: "A",
  access: "full" as const,
  plan: "Pro",
  sessionEnded: false,
  attentionCount: 0,
  websites: [],
});
it("formats confirmed plans and only disambiguates clashing workspace labels", () => {
  const first = workspace("one");
  const second = workspace("two");
  expect(workspaceName(first, [first])).toBe("Personal workspace");
  expect(workspaceName(first, [first, second])).toBe("Personal workspace");
  expect(workspaceName(second, [first, second])).toBe("Personal workspace (2)");
  expect(formatPlanLabel("unknown", "Pro")).toBe("Free");
  expect(formatPlanLabel("full", "Pro")).toBe("Pro");
  expect(pluralize(1, "website")).toBe("1 website");
  expect(pluralize(2, "website")).toBe("2 websites");
  expect(detectCountry("en", "Asia/Calcutta")).toBe("IN");
  expect(detectCountry("en", "Australia/Sydney")).toBe("AU");
});
it.each([
  [undefined, true],
  ["1", true],
  ["0", false],
])("defaults to account-wide sign-in with configuration %j", (value, enabled) => {
  expect(accountSignInEnabled(value)).toBe(enabled);
});

it("reads each workspace's REST websites with the account Bearer token", async () => {
  const fetchDomains = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const workspaceId = new URL(String(url)).searchParams.get("workspace_id");
    return Response.json([
      {
        workspace_id: workspaceId,
        domain_id: `domain-${workspaceId}`,
        domain_name: "www.ACME.example",
        homepage_url: "https://www.acme.example",
        brand_name: workspaceId === "one" ? "Acme" : null,
        crawl_headers: "redacted from picker",
      },
    ]);
  });
  const list = (id: string) =>
    readAccountDomains("token", "https://flowhunt.test", id, fetchDomains);
  expect(await Promise.all([list("one"), list("two")])).toEqual([
    [{ workspaceId: "one", domainId: "domain-one", hostname: "acme.example", brand: "Acme" }],
    [{ workspaceId: "two", domainId: "domain-two", hostname: "acme.example" }],
  ]);
  expect(fetchDomains.mock.calls.map(([url, options]) => [String(url), options?.headers])).toEqual([
    [
      "https://flowhunt.test/v2/amicited/domains?workspace_id=one",
      { Authorization: "Bearer token" },
    ],
    [
      "https://flowhunt.test/v2/amicited/domains?workspace_id=two",
      { Authorization: "Bearer token" },
    ],
  ]);
  fetchDomains.mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(list("one")).rejects.toThrow("Could not read");
  fetchDomains.mockResolvedValueOnce(Response.json({ domains: [] }));
  await expect(list("one")).rejects.toThrow();
  fetchDomains.mockResolvedValueOnce(
    Response.json([{ workspace_id: "two", domain_id: "domain-two", domain_name: "acme.example" }]),
  );
  await expect(list("one")).rejects.toThrow("different workspace");
  fetchDomains.mockResolvedValueOnce(Response.json([]));
  await expect(list("one")).resolves.toEqual([]);
});

it("reads scoped paid cloud evidence and rejects write tools and free domains", async () => {
  let paid = true;
  let destructive = false;
  const calls: unknown[] = [];
  const options: ConstructorParameters<typeof AccountConnections>[0] = {
    read: async () => ({ workspaces: [{ ...workspace("one"), access: paid ? "full" : "free" }] }),
    write: async () => {},
    secrets: () => ({
      read: async () => "credential",
      write: async () => {},
      clear: async () => {},
    }),
    client: () =>
      ({
        status: async () => ({ state: "connected" }),
        toolPolicy: async () => ({ needsApproval: destructive, destructive }),
        call: async (tool: string, args: unknown) => {
          if (tool === "list_domains")
            return {
              structuredContent: {
                domains: [{ domain_id: "domain", prompt_count: 24, countries: ["DE"] }],
              },
            };
          calls.push({ tool, args });
          return { structuredContent: { answers: ["Cloud answer"] } };
        },
      }) as unknown as CloudClient,
    openExternal: async () => {},
    userinfo: async () => ({ email: "a@gmail.com", name: "A" }),
    domains: () =>
      ({
        metadata: async () => [{ projectId: "project", domainId: "domain", workspaceId: "one" }],
      }) as unknown as DomainConnections,
  };
  const account = new AccountConnections(options);
  const result = await account.cloudEvidence("project", "discovered_results", {
    domain_id: "other",
  });
  expect(result.structuredContent).toEqual({ answers: ["Cloud answer"] });
  expect(calls).toEqual([{ tool: "discovered_results", args: { domain_id: "domain" } }]);
  destructive = true;
  await expect(account.cloudEvidence("project", "write_tool", {})).rejects.toThrow("read-only");
  paid = false;
  const free = new AccountConnections({
    ...options,
    read: async () => ({ workspaces: [{ ...workspace("one"), access: "free" }] }),
  });
  await expect(free.cloudEvidence("project", "discovered_results", {})).rejects.toThrow(
    "paid domain",
  );
  const accountWide = new AccountConnections({
    ...options,
    read: async () => ({ workspaces: [workspace("one")], currentWorkspaceId: "one" }),
    accountSignIn: {
      mcpUrl: "https://flowhunt.test/mcp/amicited",
      workspaces: async () => [],
      listDomains: async () => [],
    },
  });
  await expect(accountWide.cloudSummary("project")).resolves.toMatchObject({
    domainId: "domain",
    promptCount: 24,
    countries: ["DE"],
  });
});
it("signs in once for every workspace and keeps that sign-in until sign-out", async () => {
  const stored = new Map<string, string>();
  const targets: Array<{ endpoint?: string; account?: boolean }> = [];
  const first = { ...workspace("one"), name: "Acme" };
  stored.set("one", "old workspace credential");
  let saved: import("./account.ts").SavedAccount = {
    workspaces: [first],
    currentWorkspaceId: "one",
  };
  const localWebsite = {
    projectId: "local-project",
    hostname: "acme.example",
    brand: "Acme",
    connectionRef: "local-project",
    workspaceId: "one",
  };
  let finished!: () => void;
  const signedIn = new Promise<void>((resolve) => (finished = resolve));
  const account = new AccountConnections({
    read: async () => saved,
    write: async (value) => {
      saved = value;
      if (value.workspaces.length) finished();
    },
    secrets: (id) => ({
      read: async () => stored.get(id),
      write: async (value) => void stored.set(id, value),
      clear: async () => void stored.delete(id),
    }),
    client: (secrets, _open, _rejected, target) => {
      targets.push(target);
      return {
        connectOAuth: async () => {
          await secrets.write(JSON.stringify({ tokens: { access_token: "token" } }));
          return { state: "connected" };
        },
        status: async () => ({ state: "connected" }),
        accountAccessToken: async () => JSON.parse((await secrets.read())!).tokens.access_token,
        close: async () => {},
      } as unknown as CloudClient;
    },
    openExternal: async () => {},
    userinfo: async () => ({ email: "a@acme.com", name: "A" }),
    domains: () => ({ metadata: async () => [localWebsite] }) as unknown as DomainConnections,
    accountSignIn: {
      mcpUrl: "https://flowhunt.test/mcp/amicited",
      workspaces: (token) =>
        readAccountWorkspaces(token, "https://flowhunt.test", async (_url, options) => {
          expect(options?.headers).toMatchObject({ Authorization: "Bearer token" });
          expect(options?.body).toBe('{"limit":null}');
          return Response.json([
            { workspace_id: "one", workspace_name: "Acme", role: "O" },
            { workspace_id: "two", workspace_name: "Side project", role: "G" },
          ]);
        }),
      listDomains: async (token, workspaceId) => {
        expect(token).toBe("token");
        return [{ workspaceId, hostname: "cloud.example" }];
      },
    },
  });
  expect((await account.status()).state).toBe("session_ended");
  await account.addWorkspace();
  await signedIn;
  const status = await account.status();
  expect(status.state).toBe("signed_in");
  expect(status.workspaces.map((w) => [w.id, w.name])).toEqual([
    ["one", "Acme"],
    ["two", "Side project"],
  ]);
  expect(status.workspaces.map((w) => w.canCreateDomains)).toEqual([true, false]);
  expect(status.workspaces[0]).toMatchObject({ id: "one", websites: ["acme.example"] });
  expect(localWebsite.workspaceId).toBe("one");
  expect(await account.listCloudDomains("two")).toEqual([
    { workspaceId: "two", hostname: "cloud.example" },
  ]);
  expect((await account.status()).currentWorkspaceId).toBe("one");
  expect([...stored.keys()]).toEqual(["one", "account"]);
  expect(targets).toEqual([
    { endpoint: "https://flowhunt.test/mcp/amicited/one", account: true },
    { endpoint: "https://flowhunt.test/mcp/amicited", account: true },
    { endpoint: "https://flowhunt.test/mcp/amicited/one", account: true },
    { endpoint: "https://flowhunt.test/mcp/amicited/two", account: true },
  ]);
  await account.removeWorkspace("one");
  expect(stored.has("account")).toBe(true);
  expect((await account.status()).currentWorkspaceId).toBe("two");
  await account.signOut();
  expect(stored.has("account")).toBe(false);
});

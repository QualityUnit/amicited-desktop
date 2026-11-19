import { formatPlanLabel, pluralize } from "./formatting.ts";
import { expect, it } from "vite-plus/test";
import { AccountConnections, workspaceName } from "./account.ts";
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
  expect(workspaceName(first, [first], [])).toBe("Personal workspace");
  expect(workspaceName(first, [first, second], [])).toBe("Personal workspace");
  expect(workspaceName(second, [first, second], [])).toBe("Personal workspace (2)");
  expect(formatPlanLabel("unknown", "Pro")).toBe("Free");
  expect(formatPlanLabel("full", "Pro")).toBe("Pro");
  expect(pluralize(1, "website")).toBe("1 website");
  expect(pluralize(2, "website")).toBe("2 websites");
  expect(detectCountry("en", "Asia/Calcutta")).toBe("IN");
  expect(detectCountry("en", "Australia/Sydney")).toBe("AU");
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
});
it("signs in once for every workspace and keeps that sign-in until sign-out", async () => {
  const stored = new Map<string, string>();
  const targets: Array<{ endpoint?: string; account?: boolean }> = [];
  let saved: import("./account.ts").SavedAccount = { workspaces: [] };
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
        close: async () => {},
      } as unknown as CloudClient;
    },
    openExternal: async () => {},
    userinfo: async () => ({ email: "a@acme.com", name: "A" }),
    domains: () => undefined,
    accountSignIn: {
      mcpUrl: "https://flowhunt.test/mcp/amicited",
      workspaces: async (token) =>
        token === "token"
          ? [
              { id: "one", name: "Acme" },
              { id: "two", name: "Side project" },
            ]
          : [],
    },
  });
  await account.addWorkspace();
  await signedIn;
  const status = await account.status();
  expect(status.state).toBe("signed_in");
  expect(status.workspaces.map((w) => [w.id, w.name])).toEqual([
    ["one", "Acme"],
    ["two", "Side project"],
  ]);
  expect([...stored.keys()]).toEqual(["account"]);
  expect(targets).toEqual([
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

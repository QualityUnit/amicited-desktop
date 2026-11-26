import { formatPlanLabel } from "./formatting.ts";
import { CloudClient, toolData, type SecretStorage } from "./index.ts";
import type { DomainConnections } from "./domains.ts";
import * as Schema from "effect/Schema";
import { cloudSetupPrompts, cloudSetupWebsites } from "./setup.ts";
import type { AccountStatus, AccountWorkspace } from "./rpc.ts";

type Workspace = Schema.Schema.Type<typeof AccountWorkspace>;
type Status = Schema.Schema.Type<typeof AccountStatus>;
export interface SavedAccount {
  workspaces: readonly Workspace[];
  currentWorkspaceId?: string;
}
const ACCOUNT_SECRET = "account";
export function accountSignInEnabled(value?: string) {
  return value !== "0";
}

function canCreateDomains(role: unknown) {
  switch (role) {
    case "O":
    case "A":
    case "owner":
    case "admin":
      return true;
    case "E":
    case "G":
    case "M":
    case "T":
    case "editor":
    case "guest":
    case "member":
    case "maintainer":
      return false;
    default:
      return undefined;
  }
}
export function workspaceFromToken(token: string) {
  const claims: unknown = JSON.parse(
    Buffer.from(token.split(".")[1] ?? "", "base64url").toString(),
  );
  if (
    !claims ||
    typeof claims !== "object" ||
    !("workspace_id" in claims) ||
    typeof claims.workspace_id !== "string" ||
    !claims.workspace_id.trim()
  )
    throw new Error("The sign-in did not select a workspace.");
  return claims.workspace_id;
}
export function workspaceLabel(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  return !domain ||
    /^(gmail.com|googlemail.com|outlook.com|hotmail.com|live.com|yahoo.com|icloud.com|proton.me|protonmail.com|aol.com)$/.test(
      domain,
    )
    ? "Personal workspace"
    : `${domain} workspace`;
}

export function workspaceName(workspace: Workspace, workspaces: readonly Workspace[]) {
  const matches = workspaces.filter((w) => w.name === workspace.name);
  const ordinal = matches.findIndex((w) => w.id === workspace.id) + 1;
  return ordinal > 1 ? `${workspace.name} (${ordinal})` : workspace.name;
}

export class AccountConnections {
  private saved: SavedAccount = { workspaces: [] };
  private loaded?: Promise<void>;
  private listeners = new Set<() => void>();
  private clients = new Map<string, CloudClient>();
  private pending: CloudClient | undefined;
  private signInUrl: string | undefined;
  private error: string | undefined;
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly options: {
    read(): Promise<SavedAccount>;
    write(value: SavedAccount): Promise<void>;
    secrets(id: string): SecretStorage;
    client(
      secrets: SecretStorage,
      open: (url: string) => Promise<void>,
      rejected: () => void,
      target: { endpoint?: string; account?: boolean },
    ): CloudClient;
    /** One FlowHunt sign-in for every workspace, instead of one sign-in per workspace. */
    accountSignIn?: {
      mcpUrl: string;
      workspaces(
        token: string,
      ): Promise<ReadonlyArray<Pick<Workspace, "id" | "name" | "canCreateDomains">>>;
      listDomains(token: string, workspaceId: string): ReturnType<typeof readAccountDomains>;
    };
    openExternal(url: string): Promise<void>;
    userinfo(token: string): Promise<{ email: string; name: string }>;
    domains(): DomainConnections | undefined;
  };
  constructor(options: AccountConnections["options"]) {
    this.options = options;
  }
  private async load() {
    await (this.loaded ??= this.options.read().then((value) => {
      this.saved = value;
      // Plans change in FlowHunt, so an account sign-in rereads them once per launch.
      const first = value.workspaces[0];
      if (this.options.accountSignIn && first) void this.refreshPlans(first.id);
    }));
  }
  private serial<T>(action: () => Promise<T>) {
    const next = this.queue.then(action);
    this.queue = next.catch(() => {});
    return next;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  changed() {
    void this.serial(async () => {
      await this.load();
      let modified = false;
      const workspaces = this.saved.workspaces.map((w) => {
        const connection = this.clients.get(w.id)?.connectionSnapshot();
        if (connection?.state !== "connected") return w;
        const access =
          connection.access && connection.access !== "unknown" ? connection.access : w.access;
        const plan =
          connection.plan ??
          (access === w.access
            ? w.plan
            : access === "full"
              ? "Paid"
              : access === "free"
                ? "Free"
                : w.plan);
        if (access === w.access && plan === w.plan) return w;
        modified = true;
        return { ...w, access, plan };
      });
      if (modified) await this.save({ ...this.saved, workspaces });
      else this.notify();
    }).catch(() => {
      this.error = "Could not save account changes. Please try again.";
      this.notify();
    });
  }
  private notify() {
    this.listeners.forEach((listener) => listener());
  }
  private async save(value: SavedAccount) {
    await this.options.write(value);
    this.saved = value;
    this.notify();
  }
  currentId() {
    return this.saved.currentWorkspaceId;
  }
  private secretsFor(id: string) {
    return this.options.secrets(this.options.accountSignIn ? ACCOUNT_SECRET : id);
  }
  client(id: string) {
    let client = this.clients.get(id);
    if (!client) {
      const account = this.options.accountSignIn;
      const target = account ? { endpoint: `${account.mcpUrl}/${id}`, account: true } : {};
      client = this.options.client(
        this.secretsFor(id),
        this.options.openExternal,
        () => {
          void this.serial(async () => {
            await this.load();
            await this.save({
              ...this.saved,
              workspaces: this.saved.workspaces.map((w) =>
                w.id === id ? { ...w, sessionEnded: true } : w,
              ),
            });
          });
        },
        target,
      );
      this.clients.set(id, client);
    }
    return client;
  }
  async status(): Promise<Status> {
    await this.load();
    const rows = (await this.options.domains()?.metadata()) ?? [];
    let unreadable: string | undefined;
    const checked = await Promise.all(
      this.saved.workspaces.map(async (w) => {
        let raw: string | undefined;
        try {
          raw = await this.secretsFor(w.id).read();
        } catch (error) {
          unreadable = error instanceof Error ? error.message : String(error);
          return w;
        }
        if (!raw) return { ...w, sessionEnded: true };
        const connection = await this.client(w.id).status();
        return connection.state === "disconnected" ? { ...w, sessionEnded: true } : w;
      }),
    );
    await this.queue;
    const usable = checked.flatMap((workspace) => {
      const saved = this.saved.workspaces.find((w) => w.id === workspace.id);
      return saved
        ? [{ ...workspace, sessionEnded: workspace.sessionEnded || saved.sessionEnded }]
        : [];
    });
    const current = usable.find((w) => w.id === this.currentId());
    const problem = unreadable ?? this.error;
    return {
      state: !current ? "signed_out" : current.sessionEnded ? "session_ended" : "signed_in",
      workspaces: usable.map((w) => ({
        ...w,
        name: workspaceName(w, usable),
        plan:
          this.options.accountSignIn && w.access !== "unknown"
            ? w.plan
            : formatPlanLabel(w.access, w.plan),
        websites: rows.filter((d) => d.workspaceId === w.id).map((d) => d.hostname),
        projectIds: rows.filter((d) => d.workspaceId === w.id).map((d) => d.projectId),
      })),
      ...(current ? { currentWorkspaceId: current.id } : {}),
      signingIn: !!this.pending,
      accountWide: !!this.options.accountSignIn,
      ...(problem ? { error: problem } : {}),
    };
  }
  async addWorkspace() {
    await this.load();
    if (this.pending) return this.status();
    const generation = ++this.generation;
    let raw: string | undefined;
    const temporary: SecretStorage = {
      read: async () => raw,
      write: async (value) => {
        raw = value;
      },
      clear: async () => {
        raw = undefined;
      },
    };
    const account = this.options.accountSignIn;
    const client = this.options.client(
      temporary,
      async (url) => {
        this.signInUrl = url;
        await this.options.openExternal(url);
      },
      () => {},
      account ? { endpoint: account.mcpUrl, account: true } : {},
    );
    this.pending = client;
    this.error = undefined;
    this.notify();
    void (async () => {
      try {
        const connection = await client.connectOAuth();
        if (generation !== this.generation) return;
        if (connection.state !== "connected" || !raw)
          throw new Error(
            connection.state === "error" ? connection.message : "Sign-in did not finish.",
          );
        const credential = JSON.parse(raw) as { tokens?: { access_token?: string } };
        const token = credential.tokens?.access_token;
        if (!token) throw new Error("Sign in with an AmICited account.");
        if (account) {
          await this.finishAccountSignIn(account, token, raw, generation);
          return;
        }
        const id = workspaceFromToken(token);
        const user = await this.options.userinfo(token);
        const workspace: Workspace = {
          id,
          name: workspaceLabel(user.email),
          email: user.email,
          userName: user.name,
          plan: formatPlanLabel(connection.access, connection.plan),
          access: connection.access ?? "unknown",
          sessionEnded: false,
          attentionCount: 0,
          websites: [],
        };
        await this.serial(async () => {
          if (generation !== this.generation) return;
          await this.clients.get(id)?.close();
          this.clients.delete(id);
          await this.options.secrets(id).write(raw!);
          await this.save({
            workspaces: [...this.saved.workspaces.filter((w) => w.id !== id), workspace],
            currentWorkspaceId: id,
          });
        });
      } catch (error) {
        if (generation === this.generation)
          this.error = error instanceof Error ? error.message : "Could not sign in. Try again.";
      } finally {
        await client.close();
        if (generation === this.generation) {
          this.pending = undefined;
          this.signInUrl = undefined;
          this.notify();
        }
      }
    })();
    return this.status();
  }
  private async finishAccountSignIn(
    account: NonNullable<AccountConnections["options"]["accountSignIn"]>,
    token: string,
    raw: string,
    generation: number,
  ) {
    const [user, listed] = await Promise.all([
      this.options.userinfo(token),
      account.workspaces(token),
    ]);
    if (!listed.length) throw new Error("Create a workspace in AmICited, then sign in again.");
    await this.serial(async () => {
      if (generation !== this.generation) return;
      await Promise.all([...this.clients.values()].map((c) => c.close()));
      this.clients.clear();
      await this.options.secrets(ACCOUNT_SECRET).write(raw);
      const previous = new Map(this.saved.workspaces.map((w) => [w.id, w]));
      const workspaces = listed.map((w): Workspace => ({
        email: user.email,
        userName: user.name,
        plan: previous.get(w.id)?.plan ?? "Free",
        access: previous.get(w.id)?.access ?? "unknown",
        attentionCount: 0,
        websites: [],
        ...w,
        name: w.name || workspaceLabel(user.email),
        sessionEnded: false,
      }));
      const current = this.saved.currentWorkspaceId;
      await this.save({
        workspaces,
        currentWorkspaceId: workspaces.some((w) => w.id === current) ? current! : workspaces[0]!.id,
      });
    });
    await this.refreshPlans(listed[0]!.id);
  }
  private async refreshPlans(id: string) {
    try {
      const data = toolData(await this.client(id).call("list_workspaces", {}));
      const rows = (data as { workspaces?: unknown } | undefined)?.workspaces;
      if (!Array.isArray(rows)) return;
      const plans = new Map<string, Pick<Workspace, "access" | "plan" | "canCreateDomains">>();
      for (const row of rows as Array<Record<string, unknown>>) {
        if (typeof row.workspace_id !== "string") continue;
        const access = row.access === "full" ? "full" : "free";
        const plan = typeof row.plan === "string" && row.plan ? row.plan : "";
        const canCreate = canCreateDomains(row.role);
        plans.set(row.workspace_id, {
          access,
          plan: plan ? plan[0]!.toUpperCase() + plan.slice(1) : formatPlanLabel(access),
          ...(canCreate === undefined ? {} : { canCreateDomains: canCreate }),
        });
      }
      await this.serial(async () => {
        await this.save({
          ...this.saved,
          workspaces: this.saved.workspaces.map((w) => ({ ...w, ...plans.get(w.id) })),
        });
      });
    } catch {
      /* Plans fill in from each workspace's own status when this lookup fails. */
    }
  }
  async cancelSignIn() {
    ++this.generation;
    const pending = this.pending;
    this.pending = undefined;
    this.signInUrl = undefined;
    await pending?.close();
    this.notify();
    return this.status();
  }
  async reopenSignIn() {
    if (this.signInUrl) await this.options.openExternal(this.signInUrl);
    return this.status();
  }
  async switchWorkspace(id: string) {
    await this.serial(async () => {
      await this.load();
      if (!this.saved.workspaces.some((w) => w.id === id)) throw new Error("Workspace not found.");
      await this.save({ ...this.saved, currentWorkspaceId: id });
    });
    return this.status();
  }
  async removeWorkspace(id: string) {
    await this.cancelSignIn();
    await this.serial(async () => {
      await this.load();
      if (this.options.accountSignIn) await this.clients.get(id)?.close();
      else {
        const result = await this.client(id).disconnect();
        if (result.state === "error") throw new Error(result.message);
      }
      this.clients.delete(id);
      const workspaces = this.saved.workspaces.filter((w) => w.id !== id);
      const currentWorkspaceId = this.currentId() === id ? workspaces[0]?.id : this.currentId();
      await this.save({ workspaces, ...(currentWorkspaceId ? { currentWorkspaceId } : {}) });
    });
    return this.status();
  }
  async signOut() {
    await this.cancelSignIn();
    for (const w of this.saved.workspaces) await this.removeWorkspace(w.id);
    if (this.options.accountSignIn) await this.options.secrets(ACCOUNT_SECRET).clear();
    return this.status();
  }
  private async websiteWorkspace(workspaceId?: string) {
    await this.load();
    const current = this.currentId();
    const id = workspaceId ?? current;
    if (
      !id ||
      !this.saved.workspaces.some((workspace) => workspace.id === id) ||
      (!this.options.accountSignIn && id !== current)
    )
      throw new Error("Workspace not available.");
    return id;
  }
  async listCloudDomains(workspaceId?: string) {
    const id = await this.websiteWorkspace(workspaceId);
    const account = this.options.accountSignIn;
    if (account) {
      const token = await this.client(this.currentId() ?? id).accountAccessToken();
      return account.listDomains(token, id);
    }
    const result = await this.client(id).call("list_domains", {});
    if (result.isError) throw new Error("Could not read this workspace's websites.");
    return cloudSetupWebsites(toolData(result), id);
  }
  async listCloudPrompts(workspaceId: string, domainId: string) {
    const id = await this.websiteWorkspace(workspaceId);
    try {
      const result = await this.client(id).call("list_prompts", { domain_id: domainId });
      return result.isError ? [] : cloudSetupPrompts(toolData(result));
    } catch {
      return [];
    }
  }
  async cloudEvidence(projectId: string, tool: string, args: Record<string, unknown>) {
    const domain = (await this.options.domains()?.metadata())?.find(
      (d) => d.projectId === projectId,
    );
    const status = await this.status();
    const workspace = status.workspaces.find((w) => w.id === domain?.workspaceId);
    if (!domain?.domainId || !workspace || workspace.access !== "full" || workspace.sessionEnded)
      throw new Error("Cloud evidence requires a connected paid domain.");
    const client = this.client(workspace.id);
    const policy = await client.toolPolicy(tool);
    if (policy.needsApproval || policy.destructive)
      throw new Error("Choose a read-only cloud evidence tool.");
    return client.call(tool, { ...args, domain_id: domain.domainId });
  }
  async cloudSummary(projectId: string) {
    await this.load();
    const domain = (await this.options.domains()?.metadata())?.find(
      (d) => d.projectId === projectId,
    );
    if (!domain?.domainId || !domain.workspaceId || domain.workspaceId !== this.currentId())
      return null;
    try {
      const result = await this.client(domain.workspaceId).call("list_domains", {});
      if (result.isError) return null;
      const data = toolData(result) as { domains?: Record<string, unknown>[] };
      const row = data?.domains?.find((r) => (r.domain_id ?? r.id) === domain.domainId);
      if (!row) return null;
      const countries = Array.isArray(row.countries)
        ? row.countries.filter((c): c is string => typeof c === "string")
        : null;
      return {
        domainId: domain.domainId,
        promptCount: Array.isArray(row.prompts)
          ? row.prompts.length
          : typeof row.prompt_count === "number"
            ? row.prompt_count
            : null,
        countries,
        visibility: typeof row.visibility === "number" ? row.visibility : null,
      };
    } catch {
      return null;
    }
  }
  allClients() {
    return [...this.clients.values()];
  }
  async close() {
    await this.cancelSignIn();
    await Promise.all([...this.clients.values()].map((c) => c.close()));
  }
}

const decodeAccountDomainList = Schema.decodeUnknownSync(
  Schema.Array(
    Schema.Struct({
      workspace_id: Schema.String,
      domain_id: Schema.NonEmptyString,
      domain_name: Schema.NonEmptyString,
      brand_name: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  ),
);

export async function readAccountDomains(
  token: string,
  restUrl: string,
  workspaceId: string,
  fetchDomains = fetch,
) {
  const url = new URL("/v2/amicited/domains", restUrl);
  url.searchParams.set("workspace_id", workspaceId);
  const response = await fetchDomains(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Could not read this workspace's websites.");
  const rows = decodeAccountDomainList(await response.json());
  if (rows.some((row) => row.workspace_id !== workspaceId))
    throw new Error("AmICited returned websites from a different workspace.");
  return cloudSetupWebsites(rows, workspaceId);
}

export async function readAccountWorkspaces(
  token: string,
  restUrl: string,
  fetchWorkspaces = fetch,
) {
  const response = await fetchWorkspaces(new URL("/v2/workspaces/me/my_workspaces", restUrl), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limit: null }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error("Could not list your AmICited workspaces. Try signing in again.");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("AmICited did not return your workspaces.");
  return rows.flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return [];
    const { workspace_id: id, workspace_name: name, role } = row as Record<string, unknown>;
    const canCreate = canCreateDomains(role);
    return typeof id === "string"
      ? [
          {
            id,
            name: typeof name === "string" ? name : "",
            ...(canCreate === undefined ? {} : { canCreateDomains: canCreate }),
          },
        ]
      : [];
  });
}
export async function readAccountUserinfo(
  token: string,
  endpoint = "https://api.flowhunt.io/v2/auth/oauth/userinfo",
) {
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Could not read your AmICited account. Try signing in again.");
  const user: unknown = await response.json();
  if (
    !user ||
    typeof user !== "object" ||
    !("email" in user) ||
    typeof user.email !== "string" ||
    !("name" in user) ||
    typeof user.name !== "string"
  )
    throw new Error("AmICited did not return your account details.");
  return { email: user.email, name: user.name };
}

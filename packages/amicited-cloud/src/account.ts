import { CloudClient, toolData, type SecretStorage } from "./index.ts";
import type { DomainConnections } from "./domains.ts";
import type * as Schema from "effect/Schema";
import type { AccountStatus, AccountWorkspace } from "./rpc.ts";

type Workspace = Schema.Schema.Type<typeof AccountWorkspace>;
type Status = Schema.Schema.Type<typeof AccountStatus>;
export interface SavedAccount {
  workspaces: readonly Workspace[];
  currentWorkspaceId?: string;
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
    ): CloudClient;
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
        const access = connection.access ?? w.access;
        const plan =
          connection.plan ?? (access === "full" ? "Paid" : access === "free" ? "Free" : w.plan);
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
  client(id: string) {
    let client = this.clients.get(id);
    if (!client) {
      client = this.options.client(this.options.secrets(id), this.options.openExternal, () => {
        void this.serial(async () => {
          await this.load();
          await this.save({
            ...this.saved,
            workspaces: this.saved.workspaces.map((w) =>
              w.id === id ? { ...w, sessionEnded: true } : w,
            ),
          });
        });
      });
      this.clients.set(id, client);
    }
    return client;
  }
  async status(): Promise<Status> {
    await this.load();
    const rows = (await this.options.domains()?.metadata()) ?? [];
    const current = this.saved.workspaces.find((w) => w.id === this.currentId());
    return {
      state: !current ? "signed_out" : current.sessionEnded ? "session_ended" : "signed_in",
      workspaces: this.saved.workspaces.map((w) => ({
        ...w,
        websites: rows.filter((d) => d.workspaceId === w.id).map((d) => d.hostname),
        projectIds: rows.filter((d) => d.workspaceId === w.id).map((d) => d.projectId),
      })),
      ...(current ? { currentWorkspaceId: current.id } : {}),
      signingIn: !!this.pending,
      ...(this.error ? { error: this.error } : {}),
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
    const client = this.options.client(
      temporary,
      async (url) => {
        this.signInUrl = url;
        await this.options.openExternal(url);
      },
      () => {},
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
        const id = workspaceFromToken(token);
        const user = await this.options.userinfo(token);
        const workspace: Workspace = {
          id,
          name: workspaceLabel(user.email),
          email: user.email,
          userName: user.name,
          plan:
            connection.plan ??
            (connection.access === "full"
              ? "Paid"
              : connection.access === "free"
                ? "Free"
                : "Plan not confirmed"),
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
      const result = await this.client(id).disconnect();
      if (result.state === "error") throw new Error(result.message);
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
    return this.status();
  }
  async listCloudDomains() {
    await this.load();
    const id = this.currentId();
    if (!id) throw new Error("Sign in to continue.");
    const client = this.client(id);
    const result = await client.call("list_domains", {});
    if (result.isError) return result;
    const data = toolData(result);
    const record = (value: unknown): Record<string, unknown> =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const rows = Array.isArray(data) ? data : record(data).domains;
    if (!Array.isArray(rows)) return result;
    const domains = [];
    for (const value of rows) {
      const row = record(value);
      const domainId = row.id ?? row.domain_id;
      let prompts = row.prompts;
      if (typeof domainId === "string" && !Array.isArray(prompts)) {
        try {
          const response = await client.call("list_prompts", { domain_id: domainId });
          if (!response.isError) {
            const found = toolData(response);
            prompts = Array.isArray(found) ? found : record(found).prompts;
          }
        } catch {
          /* Offline and free-tier refusals fall back to local suggestions. */
        }
      }
      domains.push({ ...row, ...(Array.isArray(prompts) ? { prompts } : {}) });
    }
    return { ...result, structuredContent: { domains } };
  }
  allClients() {
    return [...this.clients.values()];
  }
  async close() {
    await this.cancelSignIn();
    await Promise.all([...this.clients.values()].map((c) => c.close()));
  }
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

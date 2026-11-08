import * as NodeCrypto from "node:crypto";
import type { CloudClient, SecretStorage } from "./index.ts";

export interface Domain {
  projectId: string;
  hostname: string;
  brand: string;
  connectionRef: string;
  domainId?: string;
  cms?: import("./domainModel.ts").Cms;
  siteFiles?: string | null;
  framework?: string | null;
}
export { normalizeDomain } from "./domainModel.ts";
import { normalizeDomain } from "./domainModel.ts";

const withoutDomainId = ({ domainId: _domainId, ...domain }: Domain) => domain;

// Credentials and sessions are partitioned by project, including projects without metadata.
export class DomainConnections {
  private threads = new Map<string, Set<string>>();
  bindThread(projectId: string, threadId: string) {
    const threads = this.threads.get(projectId) ?? new Set<string>();
    threads.add(threadId);
    this.threads.set(projectId, threads);
  }
  private release(projectId: string) {
    for (const threadId of this.threads.get(projectId) ?? [])
      this.client(projectId).releaseThread(threadId);
    this.threads.delete(projectId);
  }
  private clients = new Map<string, CloudClient>();
  private queue: Promise<unknown> = Promise.resolve();
  private rows: Domain[] | undefined;
  private migrationChecked = false;
  private readonly options: {
    read(): Promise<Domain[]>;
    write(rows: Domain[]): Promise<void>;
    secrets(projectId: string): SecretStorage;
    legacy: SecretStorage;
    migration?: { complete(): Promise<boolean>; finish(): Promise<void> };
    client(secrets: SecretStorage): CloudClient;
    changed(): void;
  };
  constructor(options: DomainConnections["options"]) {
    this.options = options;
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action);
    this.queue = next.catch(() => {});
    return next;
  }
  private async migrate(rows: Domain[]) {
    if (this.migrationChecked) return;
    if (await this.options.migration?.complete()) {
      this.migrationChecked = true;
      return;
    }
    const first = rows[0];
    if (!first) return;
    const legacy = await this.options.legacy.read();
    if (legacy) {
      const target = this.options.secrets(first.projectId);
      const existing = await target.read();
      if (!existing) await target.write(legacy);
      if (!existing || existing === legacy) await this.options.legacy.clear();
    }
    await this.options.migration?.finish();
    this.migrationChecked = true;
  }
  metadata() {
    if (this.rows) return Promise.resolve([...this.rows]);
    return this.serial(async () => [
      ...(this.rows ??= (await this.options.read()).map((row) => ({
        cms: "unknown" as const,
        ...row,
      }))),
    ]);
  }
  list() {
    return this.serial(async () => {
      const rows = (this.rows ??= (await this.options.read()).map((row) => ({
        cms: "unknown" as const,
        ...row,
      })));
      await this.migrate(rows);
      return [...rows];
    });
  }
  register(
    projectId: string,
    website: string,
    brand?: string,
    metadata: Pick<Domain, "cms" | "siteFiles" | "framework"> = {},
  ) {
    return this.serial(async () => {
      const rows = (this.rows ??= (await this.options.read()).map((row) => ({
        cms: "unknown" as const,
        ...row,
      })));
      const data = normalizeDomain(website, brand);
      const existing = rows.find((row) => row.projectId === projectId);
      if (existing) {
        await this.migrate(rows).catch(() => {});
        const updated = {
          ...(existing.hostname === data.hostname ? existing : withoutDomainId(existing)),
          ...data,
          ...metadata,
        };
        const next = rows.map((row) => (row.projectId === projectId ? updated : row));
        await this.options.write(next);
        this.rows = next;
        return updated;
      }
      const row = {
        projectId,
        ...data,
        cms: "unknown" as const,
        ...metadata,
        connectionRef: projectId,
      };
      // Persist the migration target before moving its credential, so retry is safe.
      await this.options.write([...rows, row]);
      this.rows = [...rows, row];
      // Cloud status retries secure migration; keyring failures cannot block local projects.
      await this.migrate([...rows, row]).catch(() => {});
      this.rows = [...rows, row];
      return row;
    });
  }
  prepareConnection(projectId: string) {
    return this.serial(async () => {
      const rows = (this.rows ??= (await this.options.read()).map((row) => ({
        cms: "unknown" as const,
        ...row,
      })));
      const domain = rows.find((row) => row.projectId === projectId);
      if (!domain) throw new Error("Add a domain before connecting AmICited.");
      this.release(projectId);
      const shared = rows.filter((row) => row.connectionRef === domain.connectionRef).length > 1;
      const next = rows.map((row) =>
        row.projectId === projectId
          ? {
              ...withoutDomainId(row),
              connectionRef: shared ? NodeCrypto.randomUUID() : row.connectionRef,
            }
          : row,
      );
      await this.options.write(next);
      this.rows = next;
      return this.client(projectId);
    });
  }
  reuse(projectId: string, sourceProjectId: string) {
    return this.serial(async () => {
      const rows = (this.rows ??= (await this.options.read()).map((row) => ({
        cms: "unknown" as const,
        ...row,
      })));
      const source = rows.find((row) => row.projectId === sourceProjectId);
      if (!source || (await this.client(sourceProjectId).status()).state !== "connected")
        throw new Error("Connect the source domain first.");
      if (!rows.some((row) => row.projectId === projectId)) throw new Error("Domain not found.");
      this.release(projectId);
      const previous = rows.find((row) => row.projectId === projectId)!;
      if (
        previous.connectionRef !== source.connectionRef &&
        rows.filter((row) => row.connectionRef === previous.connectionRef).length === 1
      ) {
        const disconnected = await this.client(projectId).disconnect();
        if (disconnected.state === "error") throw new Error(disconnected.message);
      }
      const next = rows.map((row) =>
        row.projectId === projectId
          ? { ...withoutDomainId(row), connectionRef: source.connectionRef }
          : row,
      );
      await this.options.write(next);
      this.rows = next;
    });
  }
  disconnect(projectId: string) {
    return this.serial(async () => {
      const rows = (this.rows ??= (await this.options.read()).map((row) => ({
        cms: "unknown" as const,
        ...row,
      })));
      const row = rows.find((row) => row.projectId === projectId);
      this.release(projectId);
      if (row && rows.filter((other) => other.connectionRef === row.connectionRef).length > 1) {
        const next = rows.map((other) =>
          other.projectId === projectId
            ? { ...withoutDomainId(other), connectionRef: NodeCrypto.randomUUID() }
            : other,
        );
        await this.options.write(next);
        this.rows = next;
        return this.client(projectId).status();
      }
      const result = await this.client(projectId).disconnect();
      if (row && result.state !== "error") {
        const next = rows.map((other) =>
          other.projectId === projectId ? withoutDomainId(other) : other,
        );
        await this.options.write(next);
        this.rows = next;
      }
      return result;
    });
  }
  forget(projectId: string) {
    return this.serial(async () => {
      const rows = (this.rows ??= (await this.options.read()).map((row) => ({
        cms: "unknown" as const,
        ...row,
      })));
      const row = rows.find((row) => row.projectId === projectId);
      if (!row) return;
      this.release(projectId);
      if (rows.filter((other) => other.connectionRef === row.connectionRef).length === 1) {
        const result = await this.client(projectId).disconnect();
        if (result.state === "error") throw new Error(result.message);
      }
      const next = rows.filter((other) => other.projectId !== projectId);
      await this.options.write(next);
      this.rows = next;
    });
  }
  rememberDomain(projectId: string, result: unknown) {
    return this.serial(async () => {
      const rows = (this.rows ??= (await this.options.read()).map((row) => ({
        cms: "unknown" as const,
        ...row,
      })));
      const domain = rows.find((row) => row.projectId === projectId);
      if (!domain) return;
      let domainId: string | undefined;
      const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (!value || typeof value !== "object") return;
        const row = value as Record<string, unknown>;
        const name = row.domain_name;
        const id = row.domain_id;
        if (typeof name === "string" && typeof id === "string") {
          try {
            if (normalizeDomain(name).hostname === domain.hostname) domainId = id;
          } catch {
            /* Non-domain names are unrelated resources. */
          }
        }
        if (typeof row.text === "string") {
          try {
            visit(JSON.parse(row.text));
          } catch {
            /* MCP text can be prose. */
          }
        }
        Object.values(row)
          .filter((child) => child && typeof child === "object")
          .forEach(visit);
      };
      visit(result);
      if (domainId && domainId !== domain.domainId) {
        const matchedId = domainId;
        const next = rows.map((row) =>
          row.projectId === projectId ? { ...row, domainId: matchedId } : row,
        );
        await this.options.write(next);
        this.rows = next;
      }
    });
  }
  client(projectId: string) {
    const reference =
      this.rows?.find((row) => row.projectId === projectId)?.connectionRef ?? projectId;
    let client = this.clients.get(reference);
    if (!client) {
      client = this.options.client(this.options.secrets(reference));
      client.subscribeApprovals(this.options.changed);
      this.clients.set(reference, client);
    }
    return client;
  }
  allClients() {
    return [...this.clients.values()];
  }
}

import type { ConnectionId, ConnectionsSnapshot } from "./connectionsRpc.ts";
import chatgpt from "./connectionAdapters/chatgpt.ts";
import perplexity from "./connectionAdapters/perplexity.ts";
import claude from "./connectionAdapters/claude.ts";
import google from "./connectionAdapters/google.ts";
import linkedin from "./connectionAdapters/linkedin.ts";

export const siteAdapters = { chatgpt, perplexity, claude, google, linkedin };
export const connectionCatalogue = [
  ...Object.values(siteAdapters).map((a) => ({
    id: a.id,
    label: a.label,
    group: a.id === "linkedin" ? "social" : "tracking",
    availability: a.id === "linkedin" ? "coming_soon" : "local",
    permissions:
      a.id === "linkedin"
        ? "Agents may post with your approval"
        : "Agents may ask your prompts and read the answers",
  })),
  ...(["meta_muse", "grok", "deepseek"] as const).map((id) => ({
    id,
    label: { meta_muse: "Meta Muse", grok: "Grok", deepseek: "DeepSeek" }[id],
    group: "cloud",
    availability: "locked",
    permissions: "Available with AmICited",
  })),
];
export interface SitePage {
  goto(url: string, options?: { waitUntil: "domcontentloaded"; timeout: number }): Promise<unknown>;
  locator(selector: string): { first(): { isVisible(): Promise<boolean> } };
  close(): Promise<unknown>;
  isClosed?(): boolean;
}
export type ProbeResult = "logged_in" | "logged_out" | "captcha" | "unknown";
export function classifyProbe(markers: {
  loggedIn: boolean;
  loggedOut: boolean;
  captcha: boolean;
}): ProbeResult {
  return markers.captcha
    ? "captcha"
    : markers.loggedOut
      ? "logged_out"
      : markers.loggedIn
        ? "logged_in"
        : "unknown";
}
export async function probePage(
  id: keyof typeof siteAdapters,
  page: SitePage,
): Promise<ProbeResult> {
  const a = siteAdapters[id];
  const visible = (s: string) =>
    page
      .locator(s)
      .first()
      .isVisible()
      .catch(() => false);
  const [loggedIn, loggedOut, captcha] = await Promise.all([
    visible(a.loggedIn),
    visible(a.loggedOut),
    visible('iframe[src*="captcha"], #captcha, #challenge-running, [name="cf-turnstile-response"]'),
  ]);
  return classifyProbe({ loggedIn, loggedOut, captcha });
}
type Row = ConnectionsSnapshot["connections"][number];
export interface ConnectionBrowser<P extends SitePage> {
  open(
    id: keyof typeof siteAdapters,
    visibleThread?: string,
  ): Promise<{ page: P; tabId?: string; close(): Promise<unknown> }>;
  clearCookies(domains: readonly string[]): Promise<void>;
}
export class BrowserConnections<P extends SitePage = SitePage> {
  private cancelledClosures = new Set<Promise<unknown>>();
  async drainCancellation() {
    await Promise.all(this.cancelledClosures);
  }
  private rows = new Map<ConnectionId, Row>();
  private queues = new Map<ConnectionId, Promise<unknown>>();
  private pending = new Map<ConnectionId, { page: P; close(): Promise<unknown> }>();
  private requests = new Map<string, ConnectionsSnapshot["requests"][number]>();
  private usage: ConnectionsSnapshot["usage"] = null;
  private listeners = new Set<() => void>();
  private readonly browser: ConnectionBrowser<P>;
  constructor(browser: ConnectionBrowser<P>, saved: readonly Row[] = []) {
    this.browser = browser;
    this.restore(saved);
  }
  restore(saved: readonly Row[]) {
    for (const row of saved) {
      const { tabId: _tab, threadId: _thread, ...rest } = row;
      if (row.id !== "gemini") this.rows.set(row.id, { ...rest, signingIn: false });
    }
  }
  subscribe(f: () => void) {
    this.listeners.add(f);
    return () => {
      this.listeners.delete(f);
    };
  }
  private changed() {
    this.listeners.forEach((f) => f());
  }
  snapshot(): ConnectionsSnapshot {
    return {
      connections: connectionCatalogue.map(
        (c) =>
          this.rows.get(c.id) ?? {
            id: c.id,
            status: "not_set_up",
            lastChecked: null,
            lastUsed: null,
            usedBy: [],
            signingIn: false,
          },
      ),
      requests: [...this.requests.values()],
      usage: this.usage,
    };
  }
  private row(id: ConnectionId) {
    return this.snapshot().connections.find((r) => r.id === id)!;
  }
  private update(id: ConnectionId, patch: Partial<Row>) {
    const row = this.row(id);
    this.rows.set(id, {
      ...row,
      ...patch,
      ...(patch.status === "connected" && row.status !== "connected"
        ? { reconnectedAt: new Date().toISOString() }
        : {}),
    });
    this.changed();
  }
  private serial<T>(id: ConnectionId, f: () => Promise<T>) {
    const next = (this.queues.get(id) ?? Promise.resolve()).then(f);
    this.queues.set(
      id,
      next.catch(() => {}),
    );
    return next;
  }
  private adapter(id: ConnectionId) {
    if (!(id in siteAdapters))
      throw new Error("This connection is not available for automation yet.");
    return id as keyof typeof siteAdapters;
  }
  private result(id: ConnectionId, result: ProbeResult) {
    this.update(id, {
      lastChecked: new Date().toISOString(),
      status:
        result === "logged_in"
          ? "connected"
          : result === "logged_out" && this.row(id).status !== "connected"
            ? "signed_out"
            : "needs_attention",
    });
  }
  check(id: ConnectionId) {
    return this.serial(id, async () => {
      const key = this.adapter(id);
      const tab = await this.browser.open(key);
      try {
        await tab.page.goto(siteAdapters[key].url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        this.result(id, await probePage(key, tab.page));
      } finally {
        await tab.close();
      }
      return this.snapshot();
    });
  }
  connect(id: ConnectionId, threadId: string) {
    return this.serial(id, async () => {
      const key = this.adapter(id);
      if (!this.pending.has(id)) {
        const tab = await this.browser.open(key, threadId);
        this.pending.set(id, tab);
        this.update(id, { signingIn: true, threadId, ...(tab.tabId ? { tabId: tab.tabId } : {}) });
      }
      return this.snapshot();
    });
  }
  async finishPendingSignIns() {
    for (const id of this.pending.keys()) await this.finish(id);
  }
  finish(id: ConnectionId) {
    return this.serial(id, async () => {
      const tab = this.pending.get(id);
      if (!tab) return this.snapshot();
      if (tab.page.isClosed?.()) {
        this.pending.delete(id);
        this.update(id, { signingIn: false });
        return this.snapshot();
      }
      const result = await probePage(this.adapter(id), tab.page);
      this.result(id, result);
      if (result === "logged_in") {
        await tab.close();
        this.pending.delete(id);
        this.update(id, { signingIn: false, reconnectedAt: new Date().toISOString() });
        for (const [key, r] of this.requests) if (r.connectionId === id) this.requests.delete(key);
        this.changed();
      }
      return this.snapshot();
    });
  }
  cancel(id: ConnectionId) {
    return this.serial(id, async () => {
      await this.pending.get(id)?.close();
      this.pending.delete(id);
      this.update(id, { signingIn: false });
      return this.snapshot();
    });
  }
  async disconnect(id: ConnectionId) {
    await this.cancel(id);
    return this.serial(id, async () => {
      await this.browser.clearCookies(siteAdapters[this.adapter(id)].cookies);
      this.update(id, { status: "signed_out", lastChecked: new Date().toISOString() });
      return this.snapshot();
    });
  }
  registerUsage(id: ConnectionId, dependency: { id: string; label: string; projectId?: string }) {
    this.update(id, {
      usedBy: [...this.row(id).usedBy.filter((x) => x.id !== dependency.id), dependency],
    });
  }
  unregisterUsage(id: ConnectionId, dependencyId: string) {
    this.update(id, { usedBy: this.row(id).usedBy.filter((x) => x.id !== dependencyId) });
  }
  setDailyUsage(usage: ConnectionsSnapshot["usage"]) {
    this.usage = usage;
    this.changed();
  }
  requestConnection(threadId: string, connectionId: ConnectionId, message: string) {
    this.requests.set(`${threadId}:${connectionId}`, { threadId, connectionId, message });
    this.changed();
    return this.row(connectionId);
  }
  withSiteSession<T>(
    id: ConnectionId,
    action: (page: P) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<{ status: "ok"; value: T } | { status: "needs_sign_in"; reason: ProbeResult }> {
    return this.serial(id, async () => {
      if (id === "linkedin") throw new Error("LinkedIn automation is coming soon.");
      signal?.throwIfAborted();
      const key = this.adapter(id);
      if (this.pending.has(id)) return { status: "needs_sign_in", reason: "logged_out" };
      const tab = await this.browser.open(key);
      const abort = () => {
        const closing = tab.close().catch(() => {});
        this.cancelledClosures.add(closing);
        void closing.finally(() => this.cancelledClosures.delete(closing));
      };
      signal?.addEventListener("abort", abort, { once: true });
      try {
        signal?.throwIfAborted();
        await tab.page.goto(siteAdapters[key].url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        const before = await probePage(key, tab.page);
        this.result(id, before);
        if (before !== "logged_in") return { status: "needs_sign_in", reason: before };
        let value: T;
        try {
          value = await action(tab.page);
        } catch (error) {
          const result = await probePage(key, tab.page);
          this.result(id, result);
          if (result !== "logged_in") return { status: "needs_sign_in", reason: result };
          throw error;
        }
        const after = await probePage(key, tab.page);
        this.result(id, after);
        if (after !== "logged_in") return { status: "needs_sign_in", reason: after };
        this.update(id, { lastUsed: new Date().toISOString() });
        return { status: "ok", value };
      } finally {
        signal?.removeEventListener("abort", abort);
        await tab.close();
      }
    });
  }
  async close() {
    for (const id of this.pending.keys()) await this.cancel(id);
  }
}

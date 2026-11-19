import type { ConnectionId, ConnectionsSnapshot } from "./connectionsRpc.ts";
import { inspect, type EnginePage } from "@amicited/visibility/page";
import {
  challengeSelectors,
  classifyProbe,
  isChallengePage,
  sites,
  type ProbeResult,
  type SiteId,
} from "@amicited/visibility/sites";

export { classifyProbe, sites, type ProbeResult };
export const connectionCatalogue = [
  ...Object.values(sites).map((a) => ({
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
export async function probePage(id: SiteId, page: EnginePage): Promise<ProbeResult> {
  const site = sites[id];
  const state = await page
    .run(inspect, { selectors: [site.loggedIn, site.loggedOut, ...challengeSelectors] })
    .catch(() => null);
  if (!state) return "unknown";
  const [loggedIn = false, loggedOut = false, ...challenges] = state.visible;
  return classifyProbe({
    loggedIn,
    loggedOut,
    captcha: challenges.some(Boolean) || isChallengePage(state),
  });
}
type Row = ConnectionsSnapshot["connections"][number];
export interface ConnectionBrowser {
  /** Opens a page for a site; a visible thread asks for a tab the user can sign in through. */
  open(
    id: SiteId,
    visibleThread?: string,
  ): Promise<{ page: EnginePage; tabId?: string; close(): Promise<unknown> }>;
  clearCookies(domains: readonly string[]): Promise<void>;
}
export class BrowserConnections {
  private cancelledClosures = new Set<Promise<unknown>>();
  async drainCancellation() {
    await Promise.all(this.cancelledClosures);
  }
  private rows = new Map<ConnectionId, Row>();
  private queues = new Map<ConnectionId, Promise<unknown>>();
  private pending = new Map<ConnectionId, { page: EnginePage; close(): Promise<unknown> }>();
  private requests = new Map<string, ConnectionsSnapshot["requests"][number]>();
  private usage: ConnectionsSnapshot["usage"] = null;
  private listeners = new Set<() => void>();
  private readonly browser: ConnectionBrowser;
  constructor(browser: ConnectionBrowser, saved: readonly Row[] = []) {
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
    if (!(id in sites)) throw new Error("This connection is not available for automation yet.");
    return id as SiteId;
  }
  /** Records a sign-in probe made by an engine run or a check. */
  report(id: ConnectionId, result: ProbeResult) {
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
        await tab.page.goto(sites[key].url, { timeoutMs: 15_000 });
        this.report(id, await probePage(key, tab.page));
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
      this.report(id, result);
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
      await this.browser.clearCookies(sites[this.adapter(id)].cookies);
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
  /**
   * Runs work on a fresh page of a site, one at a time per site. The work reports the
   * sign-in state it saw, or null when it saw nothing conclusive.
   */
  withSiteSession<T>(
    id: ConnectionId,
    action: (page: EnginePage) => Promise<{ value: T; probe: ProbeResult | null }>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.serial(id, async () => {
      if (id === "linkedin") throw new Error("LinkedIn automation is coming soon.");
      signal?.throwIfAborted();
      const tab = await this.browser.open(this.adapter(id));
      const abort = () => {
        const closing = tab.close().catch(() => {});
        this.cancelledClosures.add(closing);
        void closing.finally(() => this.cancelledClosures.delete(closing));
      };
      signal?.addEventListener("abort", abort, { once: true });
      try {
        signal?.throwIfAborted();
        const { value, probe } = await action(tab.page);
        if (probe) this.report(id, probe);
        this.update(id, { lastUsed: new Date().toISOString() });
        return value;
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

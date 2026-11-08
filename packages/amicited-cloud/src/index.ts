import type { DomainConnections } from "./domains.ts";
import { isUsefulResult, marketingTarget } from "@amicited/tools-core";
import * as NodeHttp from "node:http";
import * as NodeCrypto from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthTokens,
  OAuthClientInformationMixed,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import { MCP_URL, SCOPES, SUBSCRIPTION_URL, type Connection, type ErrorKind } from "./model.ts";
export * from "./model.ts";
export interface SecretStorage {
  read(): Promise<string | undefined>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}
interface Credential {
  apiKey?: string;
  tokens?: OAuthTokens;
  client?: OAuthClientInformationMixed;
  redirect?: string;
  expiresAt?: number;
}
class OAuthCallbackError extends Error {
  readonly code: string;
  readonly description: string;
  constructor(code: string, description: string) {
    super(description);
    this.code = code;
    this.description = description;
  }
}
export const errorState = (error: unknown): Extract<Connection, { state: "error" }> => {
  if (error instanceof OAuthCallbackError) {
    const messages: Record<string, string> = {
      invalid_request:
        "AmICited could not complete this sign-in request. Connect again and choose a workspace when asked.",
      invalid_target:
        "AmICited could not recognize this connection address. Update AmICited Desktop, then connect again.",
      invalid_scope:
        "AmICited could not approve the requested access. Update AmICited Desktop, then connect again.",
      access_denied: /must belong to a workspace/i.test(error.description)
        ? "Finish setting up your AmICited workspace, then connect again."
        : /workspace|CRM role/i.test(error.description)
          ? "Ask your workspace owner for access, then connect again."
          : "Sign-in was not approved. Connect again when you are ready to allow access.",
      server_error: "AmICited could not finish signing you in. Try connecting again later.",
    };
    return {
      state: "error",
      kind: "auth",
      code: error.code,
      description: error.description,
      message:
        messages[error.code] ??
        "AmICited could not finish signing you in. Connect again or check your workspace in AmICited.",
      ...(error.code === "access_denied" && /workspace|CRM role/i.test(error.description)
        ? { actionUrl: "https://app.flowhunt.io/" }
        : {}),
    };
  }
  const text = String(error);
  const kind: ErrorKind = /Pro plan|plan.*required|upgrade/i.test(text)
    ? "plan_required"
    : /credit|balance/i.test(text)
      ? "no_credits"
      : /429|rate.limit/i.test(text)
        ? "rate_limited"
        : /401|403|unauthor|invalid.grant|auth|denied|state|cancel|registration/i.test(text)
          ? "auth"
          : "network";
  const messages: Record<ErrorKind, string> = {
    auth: "We could not sign you in. Connect again or check your workspace key.",
    plan_required:
      "This AmICited tool needs a paid plan. Connecting and using the free tools does not need Pro.",
    no_credits: "This tool needs workspace credits. Add credits in AmICited, then try again.",
    rate_limited:
      "AmICited is busy with your requests. Wait for your limit to reset, then try again.",
    network:
      "We could not reach AmICited or securely save the connection. Check your connection and try again.",
  };
  return { state: "error", kind, message: messages[kind] };
};
export type ToolFailureCode =
  | "invalid_request"
  | "rate_limited"
  | "no_credits"
  | "scope_missing"
  | "not_found"
  | "plan_required";
export function toolFailure(message: string) {
  const code: ToolFailureCode = /Pro plan|plan.*required|upgrade/i.test(message)
    ? "plan_required"
    : /scope|amicited:(?:read|write|spending)/i.test(message)
      ? "scope_missing"
      : /credit|balance/i.test(message)
        ? "no_credits"
        : /429|rate.limit|hourly.*limit/i.test(message)
          ? "rate_limited"
          : /not.found|does not exist|unknown (?:tool|domain)/i.test(message)
            ? "not_found"
            : "invalid_request";
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: {
      kind: code === "plan_required" ? "amicited-upgrade" : "amicited-tool-failure",
      code,
      message,
      ...(code === "no_credits"
        ? { nextStep: "Add workspace credits in AmICited, then try again." }
        : {}),
      ...(code === "plan_required"
        ? { action: "Start 7-day free trial", url: SUBSCRIPTION_URL }
        : {}),
    },
  };
}
export class CloudClient {
  domains?: DomainConnections;
  private unassigned?: CloudClient;
  forProject(projectId: string | undefined): CloudClient {
    if (!this.domains) return this;
    if (projectId) return this.domains.client(projectId);
    return (this.unassigned ??= new CloudClient({
      secrets: {
        read: async () => undefined,
        write: async () => {
          throw new Error("Create a domain before connecting AmICited.");
        },
        clear: async () => {},
      },
      openExternal: async () => {
        throw new Error("Create a domain before connecting AmICited.");
      },
    }));
  }
  notifyApprovals() {
    this.approvalListeners.forEach((listener) => listener());
  }

  async connectionForRequest(request: string, offersAllowed: boolean, firstWin: boolean) {
    const connection = await this.status();
    if (connection.state === "connected")
      return {
        state: "connected",
        kind: "amicited-connection",
        access: connection.access ?? "unknown",
        tools: ["amicited_cloud_discover", "amicited_cloud_call"],
        instruction:
          "Use amicited_cloud_discover with list_toolsets, search_tools and describe_tool, then amicited_cloud_call with the real tool name and arguments, including free_* tools. Free checks use a small amount of workspace credits, covered by a new account’s welcome credits; no paid plan is needed. The app requests user approval for external writes and paid tools. Paid reads also use workspace credits; mention the cost before long read loops. Never claim a tool ran unless its call succeeded.",
      };
    if (!offersAllowed)
      return {
        state: "hidden",
        kind: "amicited-connection",
        instruction: "Do not suggest AmICited again. Continue helping with the free local tools.",
      };
    return {
      state: connection.state,
      connection,
      kind: "amicited-connection",
      request,
      missing: /content|draft|write/i.test(request)
        ? "Connecting AmICited is free. A draft does not measure which related searches people ask AI. One-off related-search checks use workspace credits; welcome credits cover new accounts, no paid plan needed."
        : "Connecting AmICited is free. A one-time check does not show how your brand’s mentions and citations change each day. One-off checks use workspace credits; welcome credits cover new accounts, no paid plan needed. A trial adds daily tracking.",
      ...(firstWin
        ? {
            action: "Connect AmICited",
            pricing:
              "No paid plan needed for one-off checks; they use workspace credits, covered by welcome credits on a new account. Optional 7-day trial, then EUR 120/month Pro for the full set",
            settingsPath: "/marketing-settings",
          }
        : {}),
      instruction: firstWin
        ? "The chat can offer the optional AmICited connection. Keep local tools available."
        : "Complete the local task first. Explain measurement limits honestly; do not promote a trial before the first useful result.",
    };
  }

  private approvals = new Map<
    string,
    {
      threadId: string;
      tool: string;
      free: boolean;
      readOnly: boolean;
      arguments: Record<string, unknown>;
      resolve: (
        decision: "decline" | "accept" | "acceptForSession" | "timeout" | "cancelled",
      ) => void;
    }
  >();
  private resources = new Map<string, Map<string, string>>();
  private freeGrants = new Set<string>();
  private readGrants = new Set<string>();
  private approvalListeners = new Set<() => void>();
  subscribeApprovals(listener: () => void) {
    this.approvalListeners.add(listener);
    return () => {
      this.approvalListeners.delete(listener);
    };
  }
  pendingApprovals(): Array<{
    requestId: string;
    threadId: string;
    tool: string;
    free: boolean;
    readOnly: boolean;
    arguments: Record<string, unknown>;
    message: string;
  }> {
    const own = [...this.approvals.entries()].map(([requestId, request]) => ({
      requestId,
      threadId: request.threadId,
      tool: request.tool,
      free: request.free,
      readOnly: request.readOnly,
      arguments: request.arguments,
      message: `${cloudAction(request.tool, request.arguments, request.readOnly, this.resources.get(request.threadId))} with AmICited? ${request.free ? "Uses a few workspace credits. No paid plan needed; welcome credits cover new accounts." : request.readOnly ? "Uses workspace credits." : "Changes your workspace and uses workspace credits."}`,
    }));
    return [
      ...own,
      ...(this.domains?.allClients().flatMap((client) => client.pendingApprovals()) ?? []),
    ];
  }
  releaseThread(threadId: string) {
    for (const request of this.approvals.values())
      if (request.threadId === threadId) request.resolve("cancelled");
    this.freeGrants.delete(threadId);
    this.readGrants.delete(threadId);
    this.resources.delete(threadId);
  }
  private cancelApprovals() {
    for (const request of this.approvals.values()) request.resolve("cancelled");
    this.approvals.clear();
  }
  async requestCall(
    threadId: string,
    tool: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    const generation = this.generation;
    if (
      !tool.startsWith("free_") &&
      this.current.state === "connected" &&
      this.current.access === "free"
    )
      return toolFailure(
        "This AmICited tool needs a Pro plan. Start a trial to use it; local tools and no-plan checks remain available.",
      );
    const policy = await this.toolPolicy(tool);
    const free =
      /^free_(?:brand_visibility|query_fanout|llms_txt|site_health|watermark_detection|watermark_removal)_(?:start|get)$/.test(
        tool,
      );
    if (signal?.aborted || generation !== this.generation) return this.approvalFailure("cancelled");
    const readOnly = !policy.needsApproval && !policy.destructive;
    if (
      (!free && readOnly && this.readGrants.has(threadId)) ||
      (free && !policy.needsApproval) ||
      (free && this.freeGrants.has(threadId) && !policy.destructive)
    )
      return this.threadCall(threadId, tool, args);
    const id = NodeCrypto.randomUUID();
    const decision = await new Promise<
      "decline" | "accept" | "acceptForSession" | "timeout" | "cancelled"
    >((resolve) => {
      const finish = (
        value: "decline" | "accept" | "acceptForSession" | "timeout" | "cancelled",
      ) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        this.approvals.delete(id);
        this.approvalListeners.forEach((listener) => listener());
        resolve(value);
      };
      const cancel = () => finish("cancelled");
      const timer = setTimeout(() => finish("timeout"), 10 * 60_000);
      this.approvals.set(id, { threadId, tool, free, readOnly, arguments: args, resolve: finish });
      signal?.addEventListener("abort", cancel, { once: true });
      this.approvalListeners.forEach((listener) => listener());
    });
    if (generation !== this.generation || signal?.aborted) return this.approvalFailure("cancelled");
    if (decision === "decline" || decision === "timeout" || decision === "cancelled")
      return this.approvalFailure(decision);
    if (decision === "acceptForSession" && free && !policy.destructive)
      this.freeGrants.add(threadId);
    if (decision === "acceptForSession" && !free && readOnly) this.readGrants.add(threadId);
    return this.threadCall(threadId, tool, args);
  }
  target(threadId: string, tool: string, args: Record<string, unknown>) {
    return marketingTarget(args, this.resources.get(threadId), tool);
  }
  private async threadCall(threadId: string, tool: string, args: Record<string, unknown>) {
    const result = await this.call(tool, args);
    if (!result.isError) {
      const known = this.resources.get(threadId) ?? new Map<string, string>();
      const visit = (value: unknown) => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        const row = record(value);
        const name =
          row.name ??
          row.domain ??
          row.domain_name ??
          row.prompt ??
          row.prompt_text ??
          row.text ??
          row.content;
        for (const id of [row.id, row.prompt_id ?? row.domain_id])
          if (typeof id === "string" && typeof name === "string") known.set(id, name);
        Object.values(row)
          .filter((v) => v && typeof v === "object")
          .forEach(visit);
      };
      visit(toolData(result));
      this.resources.set(threadId, known);
    }
    return result;
  }
  private approvalFailure(reason: "decline" | "timeout" | "cancelled") {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            reason === "decline"
              ? "The user declined this AmICited action. Nothing was run."
              : reason === "timeout"
                ? "Approval timed out after ten minutes. Nothing was run. Ask the user before trying again."
                : "This AmICited approval was cancelled. Nothing was run.",
        },
      ],
    };
  }
  async answerApproval(
    requestId: string,
    decision: "decline" | "accept" | "acceptForSession",
  ): Promise<{ accepted: boolean }> {
    const request = this.approvals.get(requestId);
    if (!request) {
      const owner = this.domains
        ?.allClients()
        .find((client) => client.pendingApprovals().some((row) => row.requestId === requestId));
      if (owner) return owner.answerApproval(requestId, decision);
      throw new Error("This approval is no longer pending.");
    }
    request.resolve(decision);
    return { accepted: decision !== "decline" };
  }
  async close() {
    await Promise.all(this.domains?.allClients().map((client) => client.close()) ?? []);
    ++this.generation;
    this.cancelApprovals();
    this.resources.clear();
    this.freeGrants.clear();
    this.readGrants.clear();
    this.cancelOAuth?.();
    await this.closeSession();
  }
  private current: Connection = { state: "disconnected" };
  private generation = 0;
  private checkedAt = 0;
  private session: { key: string; client: Client } | undefined;
  private policies = new Map<string, { needsApproval: boolean; destructive?: boolean }>();
  private async closeSession() {
    const session = this.session;
    this.session = undefined;
    this.policies.clear();
    await session?.client.close();
  }
  private cancelOAuth: (() => void) | undefined;
  private queue = Promise.resolve();
  private readonly options: {
    secrets: SecretStorage;
    openExternal(url: string): Promise<void>;
    endpoint?: string;
  };
  constructor(options: CloudClient["options"]) {
    this.options = options;
  }
  private async credential(): Promise<Credential | undefined> {
    const raw = await this.options.secrets.read();
    return raw ? (JSON.parse(raw) as Credential) : undefined;
  }
  private provider(
    credential: Credential,
    redirect: string,
    state: string,
    open: (url: string) => Promise<void>,
    persist: (value: Credential) => Promise<void>,
  ): OAuthClientProvider {
    let verifier = "";
    return {
      redirectUrl: redirect,
      clientMetadata: {
        client_name: "AmICited Desktop",
        redirect_uris: [redirect],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: SCOPES.join(" "),
      },
      state: () => state,
      clientInformation: () => credential.client,
      saveClientInformation: async (client) => {
        credential.client = client;
      },
      tokens: () => credential.tokens,
      saveTokens: async (tokens) => {
        credential.tokens = tokens;
        credential.redirect = redirect;
        credential.expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
        await persist(credential);
      },
      saveCodeVerifier: (value) => {
        verifier = value;
      },
      codeVerifier: () => verifier,
      redirectToAuthorization: (url) => {
        url.searchParams.set("app", "amicited");
        return open(url.href);
      },
    };
  }
  private endpoint() {
    return new URL(this.options.endpoint ?? MCP_URL);
  }
  private async withClient<T>(
    credential: Credential,
    run: (client: Client) => Promise<T>,
    persist = (value: Credential) => this.options.secrets.write(JSON.stringify(value)),
    attempt?: { signal: AbortSignal; generation: number; fetchFn: typeof fetch },
  ): Promise<T> {
    const generation = attempt?.generation ?? this.generation;
    const check = () => {
      attempt?.signal.throwIfAborted();
      if (generation !== this.generation) throw new Error("Authentication cancelled");
    };
    check();
    const key = JSON.stringify(credential);
    if (this.session?.key === key && (!credential.expiresAt || credential.expiresAt > Date.now()))
      return run(this.session.client);
    await this.closeSession();
    const provider = credential.apiKey
      ? undefined
      : this.provider(
          credential,
          credential.redirect ?? "http://127.0.0.1/callback",
          "",
          async () => {
            throw new Error("Authentication expired");
          },
          persist,
        );
    if (
      provider &&
      credential.expiresAt &&
      credential.expiresAt <= Date.now() &&
      credential.tokens?.refresh_token
    )
      await auth(provider, {
        serverUrl: this.endpoint(),
        ...(attempt ? { fetchFn: attempt.fetchFn } : {}),
      });
    const transport = new StreamableHTTPClientTransport(this.endpoint(), {
      ...(attempt ? { fetch: attempt.fetchFn } : {}),
      ...(provider ? { authProvider: provider } : {}),
      ...(credential.apiKey
        ? { requestInit: { headers: { Authorization: `Bearer ${credential.apiKey}` } } }
        : {}),
    });
    const client = new Client({ name: "amicited-desktop", version: "1.0.0" });
    const closeAttempt = () => {
      void client.close();
    };
    attempt?.signal.addEventListener("abort", closeAttempt, { once: true });
    try {
      // The SDK transport declares optional sessionId as string | undefined.
      await client.connect(
        transport as import("@modelcontextprotocol/sdk/shared/transport.js").Transport,
      );
      check();
      const result = await run(client);
      check();
      this.session = { key: JSON.stringify(credential), client };
      return result;
    } catch (error) {
      await client.close();
      throw error;
    } finally {
      attempt?.signal.removeEventListener("abort", closeAttempt);
    }
  }
  private async invoke(client: Client, name: string, args: Record<string, unknown>) {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError)
      return toolFailure(
        (Array.isArray(result.content) ? result.content : [])
          .flatMap((part: unknown) =>
            typeof record(part).text === "string" ? [record(part).text] : [],
          )
          .join("\n"),
      );
    return result;
  }
  private async validate(
    credential: Credential,
    attempt?: { signal: AbortSignal; generation: number; fetchFn: typeof fetch },
  ) {
    const result = await this.withClient(
      credential,
      (client) => this.invoke(client, "list_toolsets", {}),
      undefined,
      attempt,
    );
    if (result.isError) throw new Error(JSON.stringify(result.content));
    this.checkedAt = Date.now();
    return {
      state: "connected",
      workspace: "your AmICited workspace",
      access: this.current.state === "connected" ? (this.current.access ?? "unknown") : "unknown",
      scopes: credential.apiKey
        ? [...SCOPES]
        : (credential.tokens?.scope ?? "amicited:read").split(" "),
    } as const;
  }
  private async serial<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release = () => {};
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  }
  async status(): Promise<Connection> {
    if (
      this.current.state === "connecting" ||
      (this.current.state === "error" && this.current.code)
    )
      return this.current;
    if (this.current.state === "connected" && Date.now() - this.checkedAt < 30_000)
      return this.current;
    return this.serial(async () => {
      try {
        const credential = await this.credential();
        this.current = credential ? await this.validate(credential) : { state: "disconnected" };
      } catch (error) {
        this.current = errorState(error);
      }
      return this.current;
    });
  }
  async connectApiKey(apiKey: string): Promise<Connection> {
    this.cancelApprovals();
    this.resources.clear();
    this.freeGrants.clear();
    this.readGrants.clear();
    if (this.current.state === "connecting") return this.current;
    ++this.generation;
    return this.serial(async () => {
      this.current = { state: "connecting" };
      try {
        if (!apiKey.trim()) throw new Error("Authentication key missing");
        const credential = { apiKey: apiKey.trim() };
        const connected = await this.validate(credential);
        await this.options.secrets.write(JSON.stringify(credential));
        this.current = connected;
      } catch (error) {
        this.current = errorState(error);
      }
      return this.current;
    });
  }
  async connectOAuth(): Promise<Connection> {
    this.cancelApprovals();
    this.resources.clear();
    this.freeGrants.clear();
    this.readGrants.clear();
    if (this.current.state === "connecting") return this.current;
    this.current = { state: "connecting" };
    const generation = ++this.generation;
    const state = NodeCrypto.randomBytes(32).toString("base64url");
    const credential: Credential = {};
    let resolveCode!: (code: string) => void;
    let rejectCode!: (error: Error) => void;
    const codePromise = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    // Attach a rejection handler before discovery so cancellation cannot become unhandled.
    void codePromise.catch(() => {});
    const server = NodeHttp.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/callback" || url.searchParams.get("state") !== state) {
        res.writeHead(400).end("Invalid sign-in response.");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code || url.searchParams.has("error")) {
        const error = new OAuthCallbackError(
          url.searchParams.get("error") || "invalid_request",
          url.searchParams.get("error_description") || "AmICited returned no sign-in approval.",
        );
        console.warn("AmICited OAuth sign-in failed", {
          code: error.code,
          description: error.description,
        });
        rejectCode(error);
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(`${error.description}\n\nYou can close this tab and return to AmICited Desktop.`);
        return;
      }
      resolveCode(code);
      res.end("You can return to AmICited Desktop.");
    });
    const controller = new AbortController();
    const cancel = () => {
      controller.abort();
      rejectCode(new Error("Authentication cancelled"));
      server.close();
    };
    const timer = setTimeout(cancel, 15 * 60_000);
    this.cancelOAuth = cancel;
    const fetchFn: typeof fetch = (url, init) =>
      fetch(url, {
        ...init,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(30_000),
          ...(init?.signal ? [init.signal] : []),
        ]),
      });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Loopback unavailable");
      const redirect = `http://127.0.0.1:${address.port}/callback`;
      const provider = this.provider(
        credential,
        redirect,
        state,
        async (url) => {
          if (controller.signal.aborted || generation !== this.generation)
            throw new Error("Authentication cancelled");
          await this.options.openExternal(url);
        },
        async () => {},
      );
      await auth(provider, { serverUrl: this.endpoint(), scope: SCOPES.join(" "), fetchFn });
      await auth(provider, {
        serverUrl: this.endpoint(),
        authorizationCode: await codePromise,
        fetchFn,
      });
      const connected = await this.validate(credential, {
        signal: controller.signal,
        generation,
        fetchFn,
      });
      await this.serial(async () => {
        if (generation !== this.generation) return;
        await this.options.secrets.write(JSON.stringify(credential));
        this.current = connected;
      });
    } catch (error) {
      if (generation === this.generation) this.current = errorState(error);
    } finally {
      clearTimeout(timer);
      server.close();
      if (this.cancelOAuth === cancel) this.cancelOAuth = undefined;
    }
    return this.current;
  }
  async disconnect(): Promise<Connection> {
    ++this.generation;
    this.cancelApprovals();
    this.resources.clear();
    this.freeGrants.clear();
    this.readGrants.clear();
    this.cancelOAuth?.();
    return this.serial(async () => {
      try {
        this.current = { state: "disconnected" };
        await this.closeSession();
        this.checkedAt = 0;
        await this.options.secrets.clear();
      } catch (error) {
        this.current = errorState(error);
      }
      return this.current;
    });
  }
  async call(name: string, args: Record<string, unknown> = {}) {
    return this.serial(async () => {
      try {
        const credential = await this.credential();
        if (!credential) throw new Error("Authentication required");
        const result = await this.withClient(credential, (client) =>
          this.invoke(client, name, args),
        );
        if (result.isError) {
          if (
            "structuredContent" in result &&
            record(result.structuredContent).code === "plan_required" &&
            this.current.state === "connected"
          )
            this.current = { ...this.current, access: "free" };
          return result;
        }
        if (
          !name.startsWith("free_") &&
          !["list_toolsets", "search_tools", "describe_tool"].includes(name) &&
          this.current.state === "connected"
        )
          this.current = { ...this.current, access: "full" };
        return result;
      } catch (error) {
        const failure = errorState(error);
        this.current = failure;
        // oxlint-disable-next-line preserve-caught-error -- Remote errors can contain credentials; expose only safe copy.
        throw new Error(this.current.message);
      }
    });
  }
  async toolPolicy(name: string) {
    return this.serial(async () => {
      const credential = await this.credential();
      if (!credential) throw new Error("Connect AmICited in Settings first.");
      return this.withClient(credential, async (client) => {
        const cached = this.policies.get(name);
        if (cached) return cached;
        let cursor: string | undefined;
        do {
          const page = await client.listTools(cursor ? { cursor } : {});
          for (const tool of page.tools)
            this.policies.set(tool.name, {
              destructive: tool.annotations?.destructiveHint !== false,
              needsApproval:
                tool.annotations?.readOnlyHint !== true ||
                tool.annotations.destructiveHint !== false,
            });
          cursor = page.nextCursor;
        } while (cursor);
        const policy = this.policies.get(name);
        if (policy) return policy;
        throw new Error("Could not find this AmICited tool. Discover its real name first.");
      });
    });
  }
  resetAccess() {
    if (this.current.state === "connected") this.current = { ...this.current, access: "unknown" };
    return this.current;
  }
  async summary() {
    return { connection: await this.status() };
  }
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
export function toolData(result: unknown): unknown {
  const data = record(result);
  if (data.structuredContent) return data.structuredContent;
  if (Array.isArray(data.content))
    for (const part of data.content) {
      const text = record(part).text;
      if (typeof text === "string") {
        try {
          return JSON.parse(text);
        } catch {
          /* Unstructured responses have no headline numbers. */
        }
      }
    }
  return undefined;
}
export function visibilityHeadlines(analytics: unknown) {
  const data = record(analytics);
  return [
    ["visibility", "Visibility"],
    ["mentions", "Mentions"],
    ["citations", "Citations"],
  ].flatMap(([key, label]) => {
    const value = data[key!];
    return typeof value === "number" && Number.isFinite(value) ? [{ label: label!, value }] : [];
  });
}

export function usefulMarketingResult(output: unknown) {
  const value = toolData(output) ?? output;
  return (
    value !== null &&
    typeof value === "object" &&
    "status" in value &&
    typeof value.status === "string" &&
    isUsefulResult({ status: value.status, output: "output" in value ? value.output : undefined })
  );
}

export function cloudAction(
  tool: string,
  args: Record<string, unknown>,
  readOnly = true,
  resources?: ReadonlyMap<string, string>,
) {
  const input = record(args.request ?? args);
  const free = tool.startsWith("free_");
  const action = tool
    .replace(/^free_/, "")
    .replace(/_(start|get)$/, "")
    .replace(/^(get|list|delete|remove|create|update|set|edit)_/, "")
    .replaceAll("_", " ");
  const verb = /^(delete|remove)_/.test(tool)
    ? "Delete"
    : free
      ? "Check"
      : readOnly
        ? /^(get|list)_/.test(tool)
          ? "View"
          : "Check"
        : /^(create|update|set|edit)_/.test(tool)
          ? "Change"
          : "Run";
  return `${verb} ${action}${marketingTarget(input, resources, tool)}`;
}

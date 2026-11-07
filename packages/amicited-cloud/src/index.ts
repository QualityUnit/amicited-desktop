import { isUsefulResult } from "@amicited/tools-core";
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
export const errorState = (error: unknown): Extract<Connection, { state: "error" }> => {
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
      ...(code === "plan_required"
        ? { action: "Start 7-day free trial", url: SUBSCRIPTION_URL }
        : {}),
    },
  };
}
export class CloudClient {
  async connectionForRequest(request: string, offersAllowed: boolean, firstWin: boolean) {
    const connection = await this.status();
    if (connection.state === "connected")
      return {
        state: "connected",
        kind: "amicited-connection",
        access: connection.access,
        tools: ["amicited_cloud_discover", "amicited_cloud_call"],
        instruction:
          "Use amicited_cloud_discover with list_toolsets, search_tools and describe_tool, then amicited_cloud_call with the real tool name and arguments, including free_* tools. The app requests user approval for external writes and paid tools. Paid reads also use workspace credits; mention the cost before long read loops. Never claim a tool ran unless its call succeeded.",
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
      missing:
        "Connecting AmICited is free: brand visibility across AI assistants, query fan-out, llms.txt, site health and watermark detection. A 7-day trial or Pro adds daily prompt and citation tracking, competitors, SEO reports and audits.",
      ...(firstWin
        ? {
            action: "Connect AmICited",
            pricing:
              "Free connection and free tools. Optional 7-day trial, then EUR 120/month Pro for the full set",
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
      args: Record<string, unknown>;
      free: boolean;
      result?: unknown;
    }
  >();
  private freeGrants = new Set<string>();
  async requestCall(threadId: string, tool: string, args: Record<string, unknown>) {
    const policy = await this.toolPolicy(tool);
    const free =
      /^free_(?:brand_visibility|query_fanout|llms_txt|site_health|watermark_detection|watermark_removal)_(?:start|get)$/.test(
        tool,
      );
    const matching = [...this.approvals.entries()].find(
      ([, request]) =>
        request.threadId === threadId &&
        request.tool === tool &&
        JSON.stringify(request.args) === JSON.stringify(args),
    );
    if (matching) {
      if (matching[1].result !== undefined) {
        this.approvals.delete(matching[0]);
        return matching[1].result;
      }
      return this.approvalCard(matching[0], matching[1]);
    }
    if ((free && !policy.needsApproval) || (free && this.freeGrants.has(threadId)))
      return this.call(tool, args);
    const id = NodeCrypto.randomUUID();
    const request = { threadId, tool, args, free };
    this.approvals.set(id, request);
    return this.approvalCard(id, request);
  }
  private approvalCard(id: string, request: { tool: string; free: boolean }) {
    return {
      structuredContent: {
        kind: "amicited-approval",
        requestId: id,
        tool: request.tool,
        free: request.free,
        message: request.free
          ? "Allow this free AmICited check? It sends your input to AmICited and costs no workspace credits."
          : "Allow this AmICited action? It may change your workspace and uses workspace credits.",
      },
    };
  }
  async answerApproval(requestId: string, decision: "decline" | "accept" | "acceptForSession") {
    const request = this.approvals.get(requestId);
    if (!request || request.result !== undefined)
      throw new Error("This approval is no longer pending.");
    // Consume before awaiting to prevent double-clicks from executing twice.
    request.result = {
      isError: true,
      content: [{ type: "text", text: "This action was declined or is already running." }],
    };
    if (decision === "decline") return request.result;
    if (decision === "acceptForSession" && request.free) this.freeGrants.add(request.threadId);
    request.result = await this.call(request.tool, request.args);
    return request.result;
  }
  private current: Connection = { state: "disconnected" };
  private generation = 0;
  private checkedAt = 0;
  private session: { key: string; client: Client } | undefined;
  private policies = new Map<string, { needsApproval: boolean }>();
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
  ): Promise<T> {
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
      await auth(provider, { serverUrl: this.endpoint() });
    const transport = new StreamableHTTPClientTransport(this.endpoint(), {
      ...(provider ? { authProvider: provider } : {}),
      ...(credential.apiKey
        ? { requestInit: { headers: { Authorization: `Bearer ${credential.apiKey}` } } }
        : {}),
    });
    const client = new Client({ name: "amicited-desktop", version: "1.0.0" });
    try {
      // The SDK transport declares optional sessionId as string | undefined.
      await client.connect(
        transport as import("@modelcontextprotocol/sdk/shared/transport.js").Transport,
      );
      this.session = { key: JSON.stringify(credential), client };
    } catch (error) {
      await client.close();
      throw error;
    }
    return run(client);
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
  private async validate(credential: Credential) {
    const result = await this.withClient(credential, (client) =>
      this.invoke(client, "list_toolsets", {}),
    );
    if (result.isError) throw new Error(JSON.stringify(result.content));
    this.checkedAt = Date.now();
    return {
      state: "connected",
      workspace: "Your AmICited workspace",
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
    if (this.current.state === "connecting") return this.current;
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
    this.approvals.clear();
    this.freeGrants.clear();
    if (this.current.state === "connecting") return this.current;
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
    this.approvals.clear();
    this.freeGrants.clear();
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
        rejectCode(new Error("Authentication denied"));
        res.end("Sign-in cancelled. Return to AmICited Desktop.");
        return;
      }
      resolveCode(code);
      res.end("You can return to AmICited Desktop.");
    });
    const timer = setTimeout(() => rejectCode(new Error("Authentication cancelled")), 15 * 60_000);
    this.cancelOAuth = () => {
      rejectCode(new Error("Authentication cancelled"));
      server.close();
    };
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
        this.options.openExternal,
        async () => {},
      );
      await auth(provider, { serverUrl: this.endpoint(), scope: SCOPES.join(" ") });
      await auth(provider, { serverUrl: this.endpoint(), authorizationCode: await codePromise });
      const connected = await this.validate(credential);
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
      this.cancelOAuth = undefined;
    }
    return this.current;
  }
  async disconnect(): Promise<Connection> {
    ++this.generation;
    this.approvals.clear();
    this.freeGrants.clear();
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

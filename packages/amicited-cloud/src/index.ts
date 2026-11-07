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
          "Use amicited_cloud_discover with list_toolsets, search_tools and describe_tool, then amicited_cloud_call with the real tool name and arguments, including free_* tools. Approval is required unless the server marks a tool read-only and non-destructive. Never claim a tool ran unless its call succeeded.",
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

  private current: Connection = { state: "disconnected" };
  private generation = 0;
  private checkedAt = 0;
  private session: { key: string; client: Client } | undefined;
  private async closeSession() {
    const session = this.session;
    this.session = undefined;
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
    if (result.isError) throw new Error(JSON.stringify(result.content));
    return result;
  }
  private async validate(credential: Credential) {
    await this.withClient(credential, (client) => this.invoke(client, "list_toolsets", {}));
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
        if (
          !name.startsWith("free_") &&
          !["list_toolsets", "search_tools", "describe_tool"].includes(name) &&
          this.current.state === "connected"
        )
          this.current = { ...this.current, access: "full" };
        return result;
      } catch (error) {
        const failure = errorState(error);
        if (failure.kind === "plan_required") {
          if (this.current.state === "connected")
            this.current = { ...this.current, access: "free" };
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "This tool needs a trial or paid AmICited plan. Your connection and free tools are still available.",
              },
            ],
            structuredContent: {
              kind: "amicited-upgrade",
              message:
                "This tool needs a trial or paid AmICited plan. Your free tools are still available.",
              action: "Start 7-day free trial",
              url: SUBSCRIPTION_URL,
            },
          };
        }
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
        let cursor: string | undefined;
        do {
          const page = await client.listTools(cursor ? { cursor } : {});
          const tool = page.tools.find((tool) => tool.name === name);
          if (tool)
            return {
              needsApproval:
                tool.annotations?.readOnlyHint !== true ||
                tool.annotations.destructiveHint !== false,
            };
          cursor = page.nextCursor;
        } while (cursor);
        throw new Error("Could not find this AmICited tool. Discover its real name first.");
      });
    });
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

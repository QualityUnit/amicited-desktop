export const MCP_URL = "https://api.flowhunt.io/mcp/amicited";
export const SUBSCRIPTION_URL = "https://app.flowhunt.io/amicited/subscription";
export const DOCS_URL = "https://app.flowhunt.io/aistudio/settings?tab=apikeys";
export const SCOPES = ["amicited:read", "amicited:write", "amicited:spending"];
export type ErrorKind = "auth" | "plan_required" | "no_credits" | "rate_limited" | "network";
export type Connection =
  | { state: "disconnected" }
  | { state: "connecting" }
  | {
      state: "connected";
      workspace: string;
      plan?: string;
      access?: "free" | "full" | "unknown";
      scopes: readonly string[];
    }
  | {
      state: "error";
      kind: ErrorKind;
      message: string;
      code?: string;
      description?: string;
      actionUrl?: string;
    };

export function domainNames(domains: readonly { id: string; name: string }[] | undefined) {
  return domains?.map((domain) => domain.name) ?? [];
}

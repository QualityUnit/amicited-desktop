export const MCP_URL = "https://api.flowhunt.io/mcp/amicited";
export const SIGNUP_URL = "https://app.flowhunt.io/sign-in?app=amicited&plan=pro&interval=month";
export const DOCS_URL = "https://www.amicited.com/docs/mcp/connect/";
export const SCOPES = ["amicited:read", "amicited:write"];
export type ErrorKind = "auth" | "plan_required" | "no_credits" | "rate_limited" | "network";
export type Connection =
  | { state: "disconnected" }
  | { state: "connecting" }
  | { state: "connected"; workspace: string; plan?: string; scopes: readonly string[] }
  | { state: "error"; kind: ErrorKind; message: string };

export function domainNames(domains: readonly { id: string; name: string }[] | undefined) {
  return domains?.map((domain) => domain.name) ?? [];
}

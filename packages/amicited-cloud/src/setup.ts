import { normalizeDomain } from "./domainModel.ts";
import type { CloudWebsite } from "./rpc.ts";

export interface SetupState {
  finished: boolean;
  trackingOffered?: boolean;
  lastDomain?: string;
}
export function shouldShowSetup(loaded: boolean, _domainCount: number, finished: boolean) {
  return loaded && !finished;
}
export function defaultDomain<T extends { projectId: string }>(
  domains: readonly T[],
  lastDomain?: string | null,
) {
  return domains.find((d) => d.projectId === lastDomain) ?? domains[0];
}

export function setupAfterWebsite(access: string | undefined) {
  return access === "full" ? "cloud" : "assistant";
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function cloudSetupWebsites(data: unknown, workspaceId: string): CloudWebsite[] {
  const container = record(data);
  const rows = Array.isArray(data)
    ? data
    : (container.domains ?? container.items ?? container.data);
  if (!Array.isArray(rows)) throw new Error("AmICited did not return a website list.");
  return rows.map((value) => {
    const row = record(value);
    const website = row.domain_name ?? row.hostname ?? row.name ?? row.domain;
    if (typeof website !== "string") throw new Error("AmICited returned an invalid website.");
    const { hostname } = normalizeDomain(website);
    const domainId = row.domain_id ?? row.id;
    const brand = row.brand_name ?? row.brand;
    return {
      workspaceId,
      hostname,
      ...(typeof domainId === "string" && domainId ? { domainId } : {}),
      ...(typeof brand === "string" && brand.trim() ? { brand } : {}),
    };
  });
}

export function cloudSetupPrompts(data: unknown): string[] {
  const rows = Array.isArray(data) ? data : record(data).prompts;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    const row = record(value);
    const text =
      typeof value === "string"
        ? value
        : (row.content ?? row.prompt_text ?? row.prompt ?? row.text);
    return typeof text === "string" ? [text] : [];
  });
}

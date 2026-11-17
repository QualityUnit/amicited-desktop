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

export function cloudSetupWebsites(
  result: unknown,
): { hostname: string; prompts: string[]; domainId?: string; brand?: string }[] {
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const root = record(result);
  if (root.isError) return [];
  let data: unknown = root.structuredContent ?? result;
  if (root.structuredContent === undefined && Array.isArray(root.content))
    for (const part of root.content) {
      const text = record(part).text;
      if (typeof text === "string")
        try {
          data = JSON.parse(text);
          break;
        } catch {
          /* A free-tier refusal is not a website list. */
        }
    }
  const container = record(data);
  const rows = Array.isArray(data)
    ? data
    : (container.domains ?? container.items ?? container.data);
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    const row = record(value);
    const hostname = row.domain_name ?? row.hostname ?? row.name ?? row.domain;
    if (typeof hostname !== "string" || !hostname.includes(".")) return [];
    const prompts = Array.isArray(row.prompts)
      ? row.prompts.flatMap((p) => {
          const text =
            typeof p === "string"
              ? p
              : (record(p).prompt_text ?? record(p).prompt ?? record(p).text ?? record(p).content);
          return typeof text === "string" ? [text] : [];
        })
      : [];
    return [
      {
        hostname,
        prompts,
        ...(typeof (row.domain_id ?? row.id) === "string"
          ? { domainId: String(row.domain_id ?? row.id) }
          : {}),
        ...(typeof (row.brand_name ?? row.brand) === "string"
          ? { brand: String(row.brand_name ?? row.brand) }
          : {}),
      },
    ];
  });
}

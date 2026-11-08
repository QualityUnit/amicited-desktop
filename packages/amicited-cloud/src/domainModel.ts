export function normalizeDomain(website: string, brand = "") {
  const url = new URL(website.includes("://") ? website.trim() : `https://${website.trim()}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname.includes(".") ||
    url.username ||
    url.password
  )
    throw new Error("Enter a website like example.com.");
  const hostname = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  if (
    hostname.length > 253 ||
    hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw new Error("Enter a website like example.com.");
  return { hostname, brand: brand.trim() || hostname.split(".")[0]!.replace(/-/g, " ") };
}

export function threadsForDomain<T extends { projectId: string; environmentId: string }>(
  threads: readonly T[],
  domains: readonly { projectId: string }[],
  environmentId: string | null,
  projectId?: string,
) {
  return threads.filter((thread) =>
    projectId
      ? thread.environmentId === environmentId && thread.projectId === projectId
      : thread.environmentId !== environmentId ||
        !domains.some((domain) => domain.projectId === thread.projectId),
  );
}

export function domainToolInput(
  name: string,
  input: unknown,
  domain?: { hostname: string; brand: string },
) {
  if (!domain || !input || typeof input !== "object" || Array.isArray(input)) return input;
  const row = input as Record<string, unknown>;
  const website = `https://${domain.hostname}`;
  if (name === "seo.ssl.check") return { domain: domain.hostname, ...row };
  if (name.startsWith("seo.")) return { url: website, ...row };
  if (name === "ai.visibility.check") return { website, brand: domain.brand, ...row };
  return input;
}

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
  return { hostname, brand: brand.trim() };
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

export const cmsOptions = [
  ["wordpress", "WordPress"],
  ["webflow", "Webflow"],
  ["shopify", "Shopify"],
  ["wix", "Wix"],
  ["squarespace", "Squarespace"],
  ["hubspot", "HubSpot CMS"],
  ["ghost", "Ghost"],
  ["headless", "Headless CMS (Contentful, Sanity, Strapi…)"],
  ["git", "Git-based site (Next.js, Astro, Hugo, Jekyll, Gatsby, Eleventy, Docusaurus…)"],
  ["unknown", "Not sure"],
] as const;
export type Cms = (typeof cmsOptions)[number][0];
export function cmsLabel(cms: Cms = "unknown") {
  return cms === "git"
    ? "Git-based site"
    : cms === "headless"
      ? "Headless CMS"
      : (cmsOptions.find(([value]) => value === cms)?.[1] ?? "Not sure");
}
export function detectFramework(files: readonly string[], packageJson?: string): string | null {
  let dependencies: Record<string, unknown> = {};
  try {
    const json = JSON.parse(packageJson ?? "{}");
    dependencies = { ...json.devDependencies, ...json.dependencies };
  } catch {
    /* Configuration files can still identify the framework. */
  }
  const frameworks = [
    ["Next.js", "next", /^next\.config\./],
    ["Astro", "astro", /^astro\.config\./],
    ["Docusaurus", "@docusaurus/core", /^docusaurus\.config\./],
    ["Gatsby", "gatsby", /^gatsby-config\./],
    ["Eleventy", "@11ty/eleventy", /^(?:\.eleventy\.(?:js|cjs)|eleventy\.config\.)/],
    ["Hugo", "", /^hugo\.(?:toml|yaml|yml|json)$/],
    ["Jekyll", "", /^_config\.ya?ml$/],
  ] as const;
  return (
    frameworks.find(
      ([name, dependency, pattern]) =>
        (dependency && dependency in dependencies) ||
        files.some((file) => pattern.test(file)) ||
        (name === "Hugo" &&
          files.some((file) => /^config\.(toml|ya?ml)$/.test(file)) &&
          files.some((file) => /^(content|archetypes)\/?$/.test(file))),
    )?.[0] ?? null
  );
}
export function domainInstruction(domain?: {
  cms?: Cms;
  siteFiles?: string | null;
  framework?: string | null;
}) {
  if (!domain) return "";
  if (!domain.cms || domain.cms === "unknown")
    return `The CMS is unknown; ask if it matters. ${domain.siteFiles ? "Site files are connected at the workspace root. Agents can edit files in this folder. Nothing is published or pushed for you. Review changes in the chat. Never commit or push unless explicitly asked." : "Site files are not connected; do not claim you can edit the site."}`;
  if (domain.siteFiles)
    return `This site uses ${domain.cms === "git" ? (domain.framework ?? "a Git-based site") : cmsLabel(domain.cms)}${domain.cms !== "git" && domain.framework ? ` (site files: ${domain.framework})` : ""}. Site files are connected at the workspace root. Agents can edit files in this folder. Nothing is published or pushed for you. Review changes in the chat. Never commit or push unless explicitly asked.`;
  return `This site uses ${cmsLabel(domain.cms)}. Site files are not connected. Give steps for its admin; do not claim you can edit the site.`;
}

import * as Schema from "effect/Schema";
import {
  attrs,
  checked,
  checkOutput,
  define,
  finding,
  get,
  plain,
  unavailable,
  urlInput,
  type Fetcher,
} from "../common.ts";
import { sslCheck } from "./ssl.ts";

const crawlers = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
];
export function parseRobots(text: string, path = "/") {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current = { agents: [] as string[], rules: [] as { allow: boolean; path: string }[] };
  const sitemaps: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(line.split("#")[0]!);
    if (!match) continue;
    const key = match[1]!.toLowerCase(),
      value = match[2]!;
    if (key === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (current.rules.length) {
        groups.push(current);
        current = { agents: [], rules: [] };
      }
      current.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && value && current.agents.length)
      current.rules.push({ allow: key === "allow", path: value });
  }
  groups.push(current);
  const access = crawlers.map((crawler) => {
    const specific = groups.filter((g) => g.agents.includes(crawler.toLowerCase()));
    const rules = (specific.length ? specific : groups.filter((g) => g.agents.includes("*")))
      .flatMap((g) => g.rules)
      .filter((r) => {
        const expression = r.path
          .split("*")
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*")
          .replace(/\\\$$/, "$");
        return new RegExp("^" + expression).test(path);
      })
      .sort(
        (a, b) =>
          b.path.replace(/\*/g, "").length - a.path.replace(/\*/g, "").length ||
          Number(b.allow) - Number(a.allow),
      );
    return { crawler, allowed: rules[0]?.allow ?? true };
  });
  return { access, sitemaps };
}
export function inspectMeta(html: string) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const meta = (name: string) =>
    metas.find((m) => (m.name ?? m.property)?.toLowerCase() === name)?.content ?? "";
  const title = plain(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const canonical = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => attrs(m[0]))
    .find((m) => m.rel?.toLowerCase() === "canonical")?.href;
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => plain(m[1]!));
  const description = meta("description");
  return checked(
    [
      finding(
        "Page title",
        title.length >= 15 && title.length <= 60,
        "Clear titles help people choose your result.",
        "Write a descriptive title of roughly 15–60 characters.",
      ),
      finding(
        "Search description",
        description.length >= 50 && description.length <= 160,
        "A useful summary can improve clicks.",
        "Add a description of roughly 50–160 characters.",
      ),
      finding(
        "Canonical address",
        Boolean(canonical),
        "A canonical helps consolidate duplicate pages.",
        "Add an absolute canonical link to the preferred page.",
      ),
      finding(
        "Search indexing",
        !/\b(noindex|none)\b/i.test(meta("robots")),
        "A noindex directive hides this page from search.",
        "Remove noindex if this page should appear in search.",
      ),
      finding(
        "Social previews",
        ["og:title", "og:description", "og:image", "twitter:card"].every((k) => meta(k)),
        "Social previews help shared links stand out.",
        "Add Open Graph title, description, image and a Twitter card.",
        true,
      ),
      finding(
        "Main heading",
        h1s.length === 1,
        "One main heading makes the page topic clear.",
        "Use one descriptive H1 heading.",
      ),
      finding(
        "Page language",
        Boolean(attrs(/<html\b[^>]*>/i.exec(html)?.[0] ?? "").lang),
        "Language helps search and accessibility tools.",
        "Set the lang attribute on the HTML element.",
      ),
      finding(
        "Mobile layout",
        Boolean(meta("viewport")),
        "Mobile visitors need a readable page.",
        "Add a viewport meta tag.",
      ),
    ],
    { title, description, canonical: canonical ?? null, h1s, robots: meta("robots") },
  );
}
export function inspectSchema(html: string) {
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
    (m) => attrs(m[1]!).type?.toLowerCase() === "application/ld+json",
  );
  const findings = [
    finding(
      "Structured data present",
      blocks.length > 0,
      "Structured data helps machines understand your business.",
      "Add relevant JSON-LD structured data.",
    ),
  ];
  const types: string[] = [];
  const required: Record<string, string[]> = {
    Organization: ["name", "url"],
    Product: ["name", "offers"],
    Article: ["headline", "author", "datePublished"],
    FAQPage: ["mainEntity"],
  };
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    for (const type of [object["@type"]].flat())
      if (typeof type === "string") {
        types.push(type);
        const missing = (required[type] ?? []).filter(
          (key) => !object[key] || (Array.isArray(object[key]) && object[key].length === 0),
        );
        findings.push(
          finding(
            `${type} basic properties`,
            missing.length === 0,
            "Complete properties make structured data useful.",
            `Add ${missing.join(", ")} to ${type}.`,
          ),
        );
      }
    Object.values(object).forEach(visit);
  };
  for (const block of blocks) {
    try {
      visit(JSON.parse(block[2]!));
      findings.push(
        finding("Readable JSON-LD", true, "Search engines must be able to read the data.", ""),
      );
    } catch {
      findings.push(
        finding(
          "Readable JSON-LD",
          false,
          "Broken JSON cannot be read by search engines.",
          "Fix the JSON syntax in this structured data block.",
        ),
      );
    }
  }
  return checked(findings, {
    types,
    blocks: blocks.length,
    note: "Basic property checks, not a full rich-result validator.",
  });
}
export function siteTools(fetcher: Fetcher = fetch, ssl = sslCheck) {
  const robots = define(
    "seo.robots.check",
    "AI crawler access",
    "Check robots.txt and access for eight AI crawlers at this page.",
    urlInput,
    checkOutput,
    async ({ url }, { signal }) => {
      try {
        const text = await get(new URL("/robots.txt", url).href, signal, fetcher);
        if (/<(?:!doctype|html)\b/i.test(text))
          return unavailable("The website returned a page instead of robots.txt.");
        const parsed = parseRobots(text, new URL(url).pathname);
        return checked(
          parsed.access.map((a) =>
            finding(
              a.crawler,
              a.allowed,
              "Crawler access affects whether your pages can be discovered; access does not guarantee a citation.",
              `Review the robots.txt rule blocking ${a.crawler}.`,
              true,
            ),
          ),
          parsed,
        );
      } catch {
        return unavailable("Could not check robots.txt.");
      }
    },
    ["robots", "AI", "crawl"],
  );
  const sitemap = define(
    "seo.sitemap.check",
    "Sitemap check",
    "Find your sitemap, count listed pages and check update dates.",
    urlInput,
    checkOutput,
    async ({ url }, { signal }) => {
      let locations = [new URL("/sitemap.xml", url).href];
      try {
        locations = [
          ...parseRobots(await get(new URL("/robots.txt", url).href, signal, fetcher)).sitemaps,
          ...locations,
        ];
      } catch {
        /* The conventional sitemap can still be checked when robots.txt is unavailable. */
      }
      for (const location of [...new Set(locations)].slice(0, 5)) {
        try {
          const xml = await get(new URL(location, url).href, signal, fetcher);
          const valid =
            /<(urlset|sitemapindex)\b/i.test(xml) && /<\/\s*(urlset|sitemapindex)\s*>/i.test(xml);
          if (!valid) continue;
          const urls = [...xml.matchAll(/<loc\b[^>]*>(.*?)<\/loc>/gis)].map((m) => plain(m[1]!));
          const dates = [...xml.matchAll(/<lastmod\b[^>]*>(.*?)<\/lastmod>/gis)].map((m) =>
            Date.parse(m[1]!),
          );
          const latest = dates.length && dates.every(Number.isFinite) ? Math.max(...dates) : null;
          return checked(
            [
              finding(
                "Sitemap pages",
                urls.length > 0,
                "A sitemap helps crawlers find your pages.",
                "List your canonical page addresses in the sitemap.",
              ),
              finding(
                "Update dates",
                latest !== null && latest <= Date.now() && Date.now() - latest < 180 * 86400000,
                "Accurate update dates help crawlers prioritize fresh content.",
                "Add accurate lastmod dates when content changes.",
                true,
              ),
            ],
            {
              location,
              count: urls.length,
              kind: /<sitemapindex\b/i.test(xml)
                ? "index (counts child sitemaps, not pages)"
                : "pages",
              latest: latest === null ? null : new Date(latest).toISOString(),
            },
          );
        } catch {
          /* Try the next advertised location. */
        }
      }
      return unavailable("Could not find a readable sitemap.");
    },
  );
  const llms = define(
    "seo.llmstxt.check",
    "AI website guide",
    "Check llms.txt and llms-full.txt for useful descriptions and links.",
    urlInput,
    checkOutput,
    async ({ url }, { signal }) => {
      const files = await Promise.all(
        ["/llms.txt", "/llms-full.txt"].map(async (path) => {
          try {
            const text = await get(new URL(path, url).href, signal, fetcher);
            const useful =
              /^#\s+.+/m.test(text) &&
              /\[[^\]]+\]\(https?:\/\//.test(text) &&
              !/<html\b/i.test(text);
            return { path, status: useful ? "useful" : "needs_work", characters: text.length };
          } catch {
            return { path, status: "could_not_check", characters: null };
          }
        }),
      );
      if (files.every((f) => f.status === "could_not_check"))
        return unavailable("Could not read either AI website guide.");
      return checked(
        files.map((f) =>
          f.status === "could_not_check"
            ? {
                title: f.path,
                status: "unknown" as const,
                why: "The guide was not available; it may be missing or unreachable.",
                fix: "Check the address and consider publishing a guide.",
              }
            : finding(
                f.path,
                f.status === "useful",
                "This emerging convention can help assistants navigate your content; it does not guarantee visibility.",
                "Add a Markdown title, summary and useful links.",
                true,
              ),
        ),
        { files },
      );
    },
  );
  const meta = define(
    "seo.meta.check",
    "Search and social preview",
    "Check page titles, descriptions, social previews and mobile basics.",
    urlInput,
    checkOutput,
    async ({ url }, { signal }) => {
      try {
        return inspectMeta(await get(url, signal, fetcher));
      } catch {
        return unavailable();
      }
    },
  );
  const schema = define(
    "seo.schema.check",
    "Structured data check",
    "Check JSON-LD for business, product, article and FAQ basics.",
    urlInput,
    checkOutput,
    async ({ url }, { signal }) => {
      try {
        return inspectSchema(await get(url, signal, fetcher));
      } catch {
        return unavailable();
      }
    },
  );
  const checks = [robots, sitemap, llms, meta, schema];
  const auditOutput = Schema.Struct({
    status: Schema.Literals(["checked", "partial", "could_not_check"]),
    score: Schema.NullOr(Schema.Number),
    coverage: Schema.String,
    groups: Schema.Array(Schema.Struct({ name: Schema.String, result: checkOutput })),
    topFixes: Schema.Array(Schema.String),
  });
  const audit = define(
    "seo.site.audit",
    "Website health audit",
    "Get a website score, AI access checks and the three fixes to start with.",
    urlInput,
    auditOutput,
    async (input, ctx) => {
      const sslResult = ssl
        .run(
          { domain: new URL(input.url).hostname },
          { signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(ssl.timeoutMs)]) },
        )
        .then(
          (result) =>
            checked(
              [
                finding(
                  "SSL certificate",
                  result.chainOk && result.daysLeft > 0,
                  "Visitors need a trusted secure connection.",
                  "Renew or repair your certificate.",
                ),
              ],
              result,
            ),
          () => unavailable("Could not check the secure connection."),
        );
      const groups = await Promise.all(
        checks.map(async (tool) => ({ name: tool.title, result: await tool.run(input, ctx) })),
      );
      groups.push({ name: "Secure connection", result: await sslResult });
      const known = groups.filter((g) => g.result.score !== null);
      const incomplete = groups.some((g) => g.result.findings.some((f) => f.status === "unknown"));
      return {
        status:
          known.length === 0
            ? ("could_not_check" as const)
            : incomplete
              ? ("partial" as const)
              : ("checked" as const),
        score: known.length
          ? Math.round(known.reduce((n, g) => n + g.result.score!, 0) / known.length)
          : null,
        coverage: `${known.length}/${groups.length} checks returned a score; unavailable checks are excluded.`,
        groups,
        topFixes: groups
          .flatMap((g) => g.result.findings)
          .filter((f) => f.status === "fail" || f.status === "warn")
          .sort((a, b) => Number(b.status === "fail") - Number(a.status === "fail"))
          .slice(0, 3)
          .map((f) => f.fix),
      };
    },
    ["site", "audit", "SEO", "score"],
  );
  return { robots, sitemap, llms, meta, schema, audit };
}

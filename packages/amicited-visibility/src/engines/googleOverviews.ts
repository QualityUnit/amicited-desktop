import { EngineStop, VisibilityEngine, defaultTiming, type EngineContext } from "../engine.ts";
import { inspect, type EnginePage } from "../page.ts";
import type { RawAnswer } from "../result.ts";
import {
  expandGoogleOverview,
  readGoogleSearch,
  rejectGoogleConsent,
  type GoogleOrganicItem,
  type GoogleOverviewItem,
  type GoogleSearchSnapshot,
} from "./googleOverviews.scripts.ts";

const noOverview = "No AI Overview shown";

/**
 * Google Search: one search records the AI Overview, when Google shows one, with its citations,
 * and the first page of organic results.
 */
export class GoogleOverviewsEngine extends VisibilityEngine {
  readonly id = "google_overviews";
  readonly label = "Google AI Overviews";
  readonly site = "google";
  override readonly requiresLogin = false;
  override readonly timing = {
    ...defaultTiming,
    answerTimeoutMs: 20_000,
    settleTimeoutMs: 60_000,
    answerOptional: true,
  };
  readonly selectors = {
    answer: '[data-subtree="aimc"], [data-attrid="AIOverview"]',
    blocked: ["#captcha-form", 'form[action*="/sorry/"]'],
  };
  readonly search = {
    results: "#rso, #search",
    overview: this.selectors.answer,
    overviewBody: '[data-container-id="main-col"]',
    organic: "h3",
    exclude:
      "#tads, #tadsb, #bottomads, [data-text-ad], [data-initq], .related-question-pair, g-scrolling-carousel, g-section-with-header",
    skipText: 'button, [role="button"], script, style, noscript, svg',
    formula: "[data-xpm-copy-root]",
    expand:
      '[jsname="rPRdsc"][aria-expanded="false"], [data-subtree="aimc"] [role="button"][aria-expanded="false"]',
  };
  readonly consent = {
    rejectField: 'input[name="set_eom"][value="true"]',
    rejectButton: "#W0wltc",
  };
  /** How long an AI Overview may take to appear once the results are in. */
  readonly overviewGraceMs = 5_000;

  override entryUrl(prompt: string, country: string) {
    const url = new URL("https://www.google.com/search");
    url.searchParams.set("q", prompt);
    if (/^[a-z]{2}$/i.test(country) && country.toUpperCase() !== "ZZ")
      url.searchParams.set("gl", country.toLowerCase());
    return url.href;
  }

  /** The prompt rides in the URL; this only gets past a full-page consent screen. */
  protected async ask(page: EnginePage, _prompt: string, ctx: EngineContext) {
    const consent = await page.run(rejectGoogleConsent, this.consent);
    if (consent === "none") return;
    if (consent === "clicked") {
      const until = ctx.now().getTime() + 20_000;
      while (ctx.now().getTime() < until) {
        await ctx.sleep(1_000);
        // The page navigates away from the consent screen, so a read can fail mid-way.
        const state = await page
          .run(inspect, { selectors: [this.search.results] })
          .catch(() => null);
        if (state?.visible[0] && !/^https:\/\/consent\.google\./.test(state.url)) return;
      }
    }
    throw new EngineStop(
      "blocked",
      "Google is asking you to accept or reject cookies. Open google.com in your browser and choose.",
    );
  }

  protected override async waitForAnswer(page: EnginePage, ctx: EngineContext) {
    const t = this.timing;
    const now = () => ctx.now().getTime();
    const captcha = async (poll: number) => {
      // `run` classifies the failure as a CAPTCHA from the page itself.
      if (poll % 5 === 4 && (await this.probe(page)) === "captcha")
        throw new Error("Google is showing a CAPTCHA.");
    };
    const appearBy = now() + t.answerTimeoutMs;
    let snapshot = await this.read(page);
    for (let poll = 0; !snapshot.results && !snapshot.overview; poll++) {
      await captcha(poll);
      if (now() >= appearBy)
        throw new Error(`Google showed no results within ${t.answerTimeoutMs / 1000}s.`);
      await ctx.sleep(t.pollMs);
      snapshot = await this.read(page);
    }
    // The overview streams in, and may arrive after the results; then it may need expanding.
    const graceUntil = now() + this.overviewGraceMs;
    const settleBy = now() + t.settleTimeoutMs;
    let previous: string | null = null;
    let stable = 0;
    let expanded = false;
    for (let poll = 0; ; poll++) {
      const overview = snapshot.overview;
      if (!overview && now() >= graceUntil) return;
      if (overview) {
        stable = overview.text === previous ? stable + 1 : 0;
        previous = overview.text;
        if (stable >= (overview.text ? t.stablePolls : t.fallbackStablePolls)) {
          if (expanded || !overview.text) return;
          expanded = true;
          const clicked = await page.run(expandGoogleOverview, { selector: this.search.expand });
          if (!clicked) return;
          stable = 0;
        }
      }
      // An overview still streaming after this long is kept as it stands.
      if (now() >= settleBy) return;
      await captcha(poll);
      await ctx.sleep(t.pollMs);
      snapshot = await this.read(page);
    }
  }

  protected override async extract(page: EnginePage) {
    const answer = googleAnswer(await this.read(page, true));
    if (!answer.search?.overview && !answer.search?.organic.length)
      throw new Error("Google's results could not be read.");
    return answer;
  }

  private read(page: EnginePage, full = false) {
    return page.run(readGoogleSearch, { selectors: this.search, full });
  }
}

/** Turns a results page into an answer: the overview with its citations, and the organic results. */
export function googleAnswer(snapshot: GoogleSearchSnapshot): RawAnswer {
  const organic = snapshot.organic.map(organicResult);
  const text = snapshot.overview?.text.trim() ?? "";
  return text
    ? {
        text,
        links: overviewSources(snapshot.overview?.items ?? []),
        search: { overview: true, organic },
      }
    : { text: noOverview, links: [], search: { overview: false, organic } };
}

const isGoogle = (host: string) => /^(www\.)?google\.[a-z.]+$/.test(host);
const isInternal = (host: string) =>
  isGoogle(host) ||
  /(^|\.)(gstatic|googleusercontent|ggpht)\.com$/.test(host) ||
  host.startsWith("encrypted-tbn");

/** The page a link leads to, unwrapping `/url?q=`; null for Google's own and opaque `/goto` links. */
function target(href: string): URL | null {
  try {
    let url = new URL(href);
    if (isGoogle(url.hostname) && url.pathname === "/url") {
      const to = url.searchParams.get("q") ?? url.searchParams.get("url");
      if (to && /^https?:/.test(to)) url = new URL(to);
    }
    // Embedded data also holds display text such as "example...", which parses as a host.
    const real = /^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(url.hostname);
    return /^https?:$/.test(url.protocol) && real && !isInternal(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

const isOrigin = (url: URL) => url.pathname === "/" && !url.search;
/**
 * Citations in the order the overview shows them. Google links them through opaque redirects, so
 * the URLs come from the data it embeds beside each citation. A citation known only by its site
 * is replaced by the first full URL on that site.
 */
function overviewSources(items: readonly GoogleOverviewItem[]) {
  const sources: { url: URL; title: string }[] = [];
  const add = (href: string, title: string) => {
    const url = target(href);
    if (!url) return;
    const same = sources.find((s) => s.url.href === url.href);
    if (same) {
      same.title ||= title;
      return;
    }
    const sameSite = sources.find((s) => s.url.hostname === url.hostname);
    if (sameSite && isOrigin(url)) return;
    if (sameSite && isOrigin(sameSite.url)) sameSite.url = url;
    else sources.push({ url, title });
  };
  for (const item of items)
    if (item.kind === "link") add(item.url, item.label);
    else for (const [url, title] of embeddedLinks(item.json)) add(url, title);
  return sources.map((s) => ({ url: s.url.href, title: s.title }));
}

const entities: Record<string, string> = { quot: '"', "#39": "'", lt: "<", gt: ">", amp: "&" };
/** Page URLs in one embedded data blob, each with the first readable text beside it as its title. */
function embeddedLinks(json: string): [string, string][] {
  let data: unknown;
  try {
    data = JSON.parse(json.replace(/&(quot|#39|lt|gt|amp);/g, (_, e: string) => entities[e]!));
  } catch {
    return [];
  }
  const links: [string, string][] = [];
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    const strings = value.filter((v): v is string => typeof v === "string");
    // An image tile lists its thumbnail beside its page, but an image is not a citation.
    if (!strings.some((v) => v.includes("/images?q=tbn"))) {
      const title =
        strings.find(
          (v) => /\p{L}/u.test(v) && !/^(https?:|\/|&)/.test(v) && !/^[\w-]{20,}$/.test(v),
        ) ?? "";
      for (const v of strings)
        if (/^https?:\/\//.test(v) && !/\.(jpe?g|png|gif|webp|svg|avif)(\?|$)/i.test(v))
          links.push([v, title]);
    }
    value.forEach(visit);
  };
  visit(data);
  return links;
}

const platforms: Record<string, string> = {
  youtube: "youtube.com",
  instagram: "instagram.com",
  facebook: "facebook.com",
  reddit: "reddit.com",
  tiktok: "tiktok.com",
  linkedin: "linkedin.com",
  x: "x.com",
  twitter: "x.com",
  quora: "quora.com",
  pinterest: "pinterest.com",
  medium: "medium.com",
};
/**
 * Google links organic results through opaque redirects too, and embeds no full URL for them,
 * so a result is known by its displayed site unless the link leads straight to the page.
 */
function organicResult(item: GoogleOrganicItem) {
  const direct = target(item.url);
  if (direct) return { url: direct.href, title: item.title, domain: direct.hostname };
  const shown = /^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?=[\s›/:·]|$)/i
    .exec(item.cite.trim())?.[1]
    ?.toLowerCase();
  const platform = item.text
    .split("\n")
    .slice(1)
    .map((line) => platforms[/^(\w+)(?: · |$)/.exec(line)?.[1]?.toLowerCase() ?? ""])
    .find(Boolean);
  const domain = shown ?? platform;
  if (domain) return { url: `https://${domain}/`, title: item.title, domain };
  const link = new URL(item.url);
  link.searchParams.delete("gsessionid");
  return { url: link.href, title: item.title, domain: "" };
}

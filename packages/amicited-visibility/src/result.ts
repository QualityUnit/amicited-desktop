import * as Schema from "effect/Schema";

export const engineIds = [
  "chatgpt",
  "perplexity",
  "gemini",
  "claude",
  "google",
  "google_overviews",
] as const;
export const EngineId = Schema.Literals(engineIds);
export type EngineId = typeof EngineId.Type;

/** `blocked` is a CAPTCHA or bot challenge; `logged_out` is a site that needs the user's sign-in. */
export const ResultStatus = Schema.Literals(["answered", "blocked", "logged_out", "failed"]);
export type ResultStatus = typeof ResultStatus.Type;

export const Source = Schema.Struct({
  url: Schema.String,
  title: Schema.String,
  domain: Schema.String,
  /** 1-based, in the order the answer shows its links. */
  position: Schema.Number,
});
export type Source = typeof Source.Type;

export const BrandMention = Schema.Struct({
  mentioned: Schema.Boolean,
  /** Character offsets into `text`. */
  offsets: Schema.Array(Schema.Number),
  /** Rank of the first list item that names the brand, if the answer is a list. */
  listPosition: Schema.NullOr(Schema.Number),
});
export const DomainMention = Schema.Struct({
  mentioned: Schema.Boolean,
  offsets: Schema.Array(Schema.Number),
  /** Positions of `sources` on the brand's domain. */
  citedAt: Schema.Array(Schema.Number),
});

export const VisibilityResult = Schema.Struct({
  engine: EngineId,
  prompt: Schema.String,
  /** ISO timestamp of the capture. */
  capturedAt: Schema.String,
  /** ISO country the capture ran from. */
  country: Schema.String,
  status: ResultStatus,
  /** Why the result is not an answer; null exactly when answered. */
  reason: Schema.NullOr(Schema.String),
  text: Schema.String,
  sources: Schema.Array(Source),
  brand: BrandMention,
  domain: DomainMention,
  competitors: Schema.Array(Schema.String),
  /** The page's own sign-in state at capture time. */
  session: Schema.Literals(["logged_in", "logged_out", "unknown"]),
  pageUrl: Schema.NullOr(Schema.String),
});
export type VisibilityResult = typeof VisibilityResult.Type;

export interface RawAnswer {
  readonly text: string;
  readonly links: readonly { readonly url: string; readonly title?: string }[];
}
export interface Subject {
  readonly brand: string;
  readonly domain: string;
  readonly competitors?: readonly string[] | undefined;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordPattern = (terms: readonly string[]) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${terms.filter(Boolean).map(escape).join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
const offsets = (text: string, terms: readonly string[]) =>
  terms.some(Boolean) ? [...text.matchAll(wordPattern(terms))].map((m) => m.index) : [];
const bareDomain = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** Keeps http(s) links in order, unwraps Google redirects, drops text fragments and repeats. */
export function normalizeSources(links: RawAnswer["links"]): Source[] {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.url);
      if (/(^|\.)google\.[a-z.]+$/.test(url.hostname) && url.pathname === "/url") {
        const target = url.searchParams.get("q") ?? url.searchParams.get("url");
        if (target) url = new URL(target);
      }
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol)) continue;
    if (url.hash.startsWith("#:~:")) url.hash = "";
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    sources.push({
      url: url.href,
      title: link.title?.trim() ?? "",
      domain: bareDomain(url.hostname),
      position: sources.length + 1,
    });
  }
  return sources;
}

const listItem = /^\s*(?:(\d+)[.)]|[-*•])\s+/;
/** Finds where the brand, its domain and competitors appear in an answer. */
export function analyzeAnswer(answer: RawAnswer, subject: Subject) {
  const text = answer.text;
  const domain = bareDomain(subject.domain);
  const sources = normalizeSources(answer.links);
  const brandOffsets = offsets(text, [subject.brand]);
  const domainOffsets = offsets(text, [domain]);
  const names = [subject.brand.trim(), domain].filter(Boolean);
  const named = (line: string) =>
    names.length > 0 && new RegExp(wordPattern(names).source, "iu").test(line);
  const listed = text.split("\n").filter((line) => listItem.test(line));
  const index = listed.findIndex(named);
  const numbered = index < 0 ? undefined : listItem.exec(listed[index]!)?.[1];
  const known = (subject.competitors ?? []).filter(
    (name) => name.trim() && offsets(text, [name]).length,
  );
  const guessed = listed
    .filter((line) => !named(line))
    .flatMap((line) => {
      const name =
        /^\s*(?:\d+[.)]|[-*•])\s+(?:\*\*)?([\p{L}\p{N}][\p{L}\p{N} .&-]{1,60}?)(?:\*\*|:| – | — |$)/u
          .exec(line)?.[1]
          ?.trim();
      return name ? [name] : [];
    });
  const brand = subject.brand.trim().toLowerCase();
  return {
    text,
    sources,
    brand: {
      mentioned: brandOffsets.length > 0,
      offsets: brandOffsets,
      listPosition: index < 0 ? null : numbered ? Number(numbered) : index + 1,
    },
    domain: {
      mentioned: domainOffsets.length > 0,
      offsets: domainOffsets,
      citedAt: sources
        .filter((s) => s.domain === domain || s.domain.endsWith(`.${domain}`))
        .map((s) => s.position),
    },
    competitors: [...new Set([...known, ...guessed])].filter((n) => n.toLowerCase() !== brand),
  };
}

export interface ResultBase {
  readonly engine: EngineId;
  readonly prompt: string;
  readonly capturedAt: string;
  readonly country: string;
  readonly session?: VisibilityResult["session"];
  readonly pageUrl?: string | null;
}
const empty = {
  text: "",
  sources: [],
  brand: { mentioned: false, offsets: [], listPosition: null },
  domain: { mentioned: false, offsets: [], citedAt: [] },
  competitors: [],
};
/** The only constructors for results, so every result satisfies the model's invariants. */
export function answeredResult(
  base: ResultBase,
  answer: RawAnswer,
  subject: Subject,
): VisibilityResult {
  return {
    engine: base.engine,
    prompt: base.prompt,
    capturedAt: base.capturedAt,
    country: base.country,
    session: base.session ?? "unknown",
    pageUrl: base.pageUrl ?? null,
    status: "answered",
    reason: null,
    ...analyzeAnswer(answer, subject),
  };
}
export function unansweredResult(
  base: ResultBase,
  status: Exclude<ResultStatus, "answered">,
  reason: string,
): VisibilityResult {
  return {
    engine: base.engine,
    prompt: base.prompt,
    capturedAt: base.capturedAt,
    country: base.country,
    session: base.session ?? (status === "logged_out" ? "logged_out" : "unknown"),
    pageUrl: base.pageUrl ?? null,
    status,
    reason: reason.trim() || "The answer could not be collected.",
    ...empty,
  };
}

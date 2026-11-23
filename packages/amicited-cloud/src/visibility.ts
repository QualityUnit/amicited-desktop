import { EngineId as TrackingEngine } from "@amicited/visibility/result";
import * as Schema from "effect/Schema";
import type { PromptHistory, TrackingAnswer, TrackingRun } from "./tracking.ts";

const Rate = Schema.NullOr(Schema.Number);
export const VisibilityDay = Schema.Struct({
  day: Schema.String,
  answers: Schema.Number,
  shareOfVoice: Rate,
  shareOfCitation: Rate,
  mentionRate: Rate,
});
export const EngineVisibility = Schema.Struct({
  engine: TrackingEngine,
  answers: Schema.Number,
  mentioned: Schema.Number,
  mentionRate: Rate,
  previousMentionRate: Rate,
  /** Answers with at least one link on the domain. */
  cited: Schema.Number,
  averagePosition: Rate,
});
export const PromptVisibility = Schema.Struct({
  promptId: Schema.String,
  answers: Schema.Number,
  mentioned: Schema.Number,
  mentionRate: Rate,
  cited: Schema.Number,
  averagePosition: Rate,
  /** The brand most often named in this prompt's answers that left the user's brand out. */
  namedInstead: Schema.NullOr(Schema.String),
  /** Each engine's newest check of this prompt, answered or not. */
  latest: Schema.Array(
    Schema.Struct({
      engine: TrackingEngine,
      status: Schema.String,
      mentioned: Schema.Boolean,
      position: Rate,
      capturedAt: Schema.optionalKey(Schema.String),
      reason: Schema.optionalKey(Schema.String),
    }),
  ),
});
/** One domain's AI visibility from this computer's checks, measured like the AmICited dashboard. */
export const DomainVisibility = Schema.Struct({
  projectId: Schema.String,
  /** The window's first and last local day, inclusive. */
  from: Schema.String,
  to: Schema.String,
  answers: Schema.Number,
  lastDay: Schema.NullOr(Schema.String),
  shareOfVoice: Rate,
  previousShareOfVoice: Rate,
  shareOfCitation: Rate,
  previousShareOfCitation: Rate,
  /** Answers that name the brand. */
  mentioned: Schema.Number,
  mentionRate: Rate,
  previousMentionRate: Rate,
  /** Answers that rank the brand in a list. Lower positions are better. */
  positioned: Schema.Number,
  averagePosition: Rate,
  previousAveragePosition: Rate,
  days: Schema.Array(VisibilityDay),
  /** Every distinct brand named in the window. */
  brandCount: Schema.Number,
  brands: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      share: Schema.Number,
      previousShare: Rate,
      rank: Schema.Number,
      you: Schema.Boolean,
    }),
  ),
  engines: Schema.Array(EngineVisibility),
  prompts: Schema.Array(PromptVisibility),
  totalCitations: Schema.Number,
  sources: Schema.Array(
    Schema.Struct({
      domain: Schema.String,
      citations: Schema.Number,
      share: Schema.Number,
      you: Schema.Boolean,
    }),
  ),
  citedPageCount: Schema.Number,
  pages: Schema.Array(
    Schema.Struct({ url: Schema.String, title: Schema.String, citations: Schema.Number }),
  ),
});
export type DomainVisibility = typeof DomainVisibility.Type;

const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");
const hostOf = (url: string) => {
  try {
    return bare(new URL(url).hostname);
  } catch {
    return "";
  }
};
/** A percentage with one decimal, or null when nothing was measured: no mention is not 0%. */
const pct = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 1000) / 10 : null;
const mean = (sum: number, count: number) => (count ? Math.round((sum / count) * 10) / 10 : null);
const shiftDay = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
/** The first local day of the window that ends today. */
export const windowStart = (today: string, windowDays = 30) => shiftDay(today, 1 - windowDays);
const domainMatcher = (hostname: string) => {
  const domain = bare(hostname);
  return (host: string) => !!host && (host === domain || host.endsWith(`.${domain}`));
};
const linksOf = (answer: TrackingAnswer) =>
  answer.sources
    ? answer.sources.map((s) => ({ url: s.url, title: s.title, host: s.domain || hostOf(s.url) }))
    : answer.citations.map((url) => ({ url, title: "", host: hostOf(url) }));
const count = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);
const ranked = <K>(map: Map<K, number>) =>
  [...map.entries()].toSorted((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
/** The top `limit` entries, plus the user's own entry at its real rank when it falls below them. */
const topWithYou = <T extends { you: boolean }>(rows: readonly T[], limit: number) => [
  ...rows.slice(0, limit),
  ...rows.slice(limit).filter((r) => r.you),
];

interface Tally {
  answers: number;
  mentions: number;
  allMentions: number;
  citations: number;
  allCitations: number;
  cited: number;
  positioned: number;
  positionSum: number;
}
const empty = (): Tally => ({
  answers: 0,
  mentions: 0,
  allMentions: 0,
  citations: 0,
  allCitations: 0,
  cited: 0,
  positioned: 0,
  positionSum: 0,
});
const isNamed = (a: TrackingAnswer) => !!(a.brand?.mentioned || a.domain?.mentioned || a.mentioned);
const tallyOf = <K>(map: Map<K, Tally>, key: K) => map.get(key) ?? map.set(key, empty()).get(key)!;

/**
 * Share of voice is the brand's mentions over every brand mention; share of citation is the
 * links on the brand's domain over every cited link. The latest answer per prompt, engine and
 * day counts once, and only answered checks count.
 */
export function domainVisibility(
  projectId: string,
  runs: readonly TrackingRun[],
  subject: { brand: string; hostname: string },
  today: string,
  windowDays = 30,
): DomainVisibility {
  const from = windowStart(today, windowDays);
  const previousFrom = shiftDay(from, -windowDays);
  const domain = bare(subject.hostname);
  const onDomain = domainMatcher(subject.hostname);
  const brand = subject.brand.trim() || subject.hostname;
  const latest = new Map<string, { day: string; answer: TrackingAnswer }>();
  const newest = new Map<string, TrackingAnswer>();
  for (const run of runs) {
    if (run.day < previousFrom || run.day > today) continue;
    for (const answer of run.answers) {
      if (answer.status === "answered")
        latest.set(`${run.day}|${answer.promptId}|${answer.engine}`, { day: run.day, answer });
      if (run.day >= from) newest.set(`${answer.promptId}|${answer.engine}`, answer);
    }
  }

  const current = empty();
  const previous = empty();
  const byDay = new Map<string, Tally>();
  const byEngine = new Map<TrackingAnswer["engine"], Tally>();
  const previousByEngine = new Map<TrackingAnswer["engine"], Tally>();
  const byPrompt = new Map<string, Tally>();
  const namedInstead = new Map<string, Map<string, number>>();
  const brands = new Map<string, number>();
  const previousBrands = new Map<string, number>();
  const sources = new Map<string, number>();
  const pages = new Map<string, number>();
  const titles = new Map<string, string>();
  for (const { day, answer } of latest.values()) {
    const named = isNamed(answer);
    const position = named ? (answer.brand?.listPosition ?? answer.position) : null;
    const others = [...new Set(answer.competitorsMentioned)].filter(
      (name) => name.trim() && name.toLowerCase() !== brand.toLowerCase(),
    );
    const links = linksOf(answer);
    const own = links.filter((l) => onDomain(l.host)).length;
    const add = (tally: Tally) => {
      tally.answers += 1;
      tally.mentions += named ? 1 : 0;
      tally.allMentions += (named ? 1 : 0) + others.length;
      tally.citations += own;
      tally.allCitations += links.length;
      tally.cited += own ? 1 : 0;
      if (position !== null) {
        tally.positioned += 1;
        tally.positionSum += position;
      }
    };
    const tallyBrands = (map: Map<string, number>) => {
      if (named) count(map, brand);
      for (const name of others) count(map, name);
    };
    if (day < from) {
      add(previous);
      add(tallyOf(previousByEngine, answer.engine));
      tallyBrands(previousBrands);
      continue;
    }
    for (const tally of [
      current,
      tallyOf(byDay, day),
      tallyOf(byEngine, answer.engine),
      tallyOf(byPrompt, answer.promptId),
    ])
      add(tally);
    tallyBrands(brands);
    if (!named) {
      const instead = namedInstead.get(answer.promptId) ?? new Map<string, number>();
      for (const name of others) count(instead, name);
      namedInstead.set(answer.promptId, instead);
    }
    for (const link of links) {
      if (link.host) count(sources, onDomain(link.host) ? domain : link.host);
      if (!onDomain(link.host)) continue;
      count(pages, link.url);
      if (link.title && !titles.has(link.url)) titles.set(link.url, link.title);
    }
  }

  const days = [...byDay.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([day, t]) => ({
      day,
      answers: t.answers,
      shareOfVoice: pct(t.mentions, t.allMentions),
      shareOfCitation: pct(t.citations, t.allCitations),
      mentionRate: pct(t.mentions, t.answers),
    }));
  const brandRows = ranked(brands).map(([name, n], i) => ({
    name,
    share: pct(n, current.allMentions) ?? 0,
    previousShare: previousBrands.has(name)
      ? pct(previousBrands.get(name)!, previous.allMentions)
      : null,
    rank: i + 1,
    you: name === brand,
  }));
  const sourceRows = ranked(sources).map(([host, n]) => ({
    domain: host,
    citations: n,
    share: pct(n, current.allCitations) ?? 0,
    you: host === domain,
  }));
  const promptIds = new Set([...newest.keys()].map((key) => key.slice(0, key.lastIndexOf("|"))));
  return {
    projectId,
    from,
    to: today,
    answers: current.answers,
    lastDay: days.at(-1)?.day ?? null,
    shareOfVoice: pct(current.mentions, current.allMentions),
    previousShareOfVoice: pct(previous.mentions, previous.allMentions),
    shareOfCitation: pct(current.citations, current.allCitations),
    previousShareOfCitation: pct(previous.citations, previous.allCitations),
    mentioned: current.mentions,
    mentionRate: pct(current.mentions, current.answers),
    previousMentionRate: pct(previous.mentions, previous.answers),
    positioned: current.positioned,
    averagePosition: mean(current.positionSum, current.positioned),
    previousAveragePosition: mean(previous.positionSum, previous.positioned),
    days,
    brandCount: brands.size,
    brands: topWithYou(brandRows, 7),
    engines: [...byEngine.entries()]
      .map(([engine, t]) => ({
        engine,
        answers: t.answers,
        mentioned: t.mentions,
        mentionRate: pct(t.mentions, t.answers),
        previousMentionRate: pct(
          previousByEngine.get(engine)?.mentions ?? 0,
          previousByEngine.get(engine)?.answers ?? 0,
        ),
        cited: t.cited,
        averagePosition: mean(t.positionSum, t.positioned),
      }))
      .toSorted((a, b) => (b.mentionRate ?? 0) - (a.mentionRate ?? 0)),
    prompts: [...promptIds].map((promptId) => {
      const t = byPrompt.get(promptId) ?? empty();
      return {
        promptId,
        answers: t.answers,
        mentioned: t.mentions,
        mentionRate: pct(t.mentions, t.answers),
        cited: t.cited,
        averagePosition: mean(t.positionSum, t.positioned),
        namedInstead: ranked(namedInstead.get(promptId) ?? new Map())[0]?.[0] ?? null,
        latest: [...newest.entries()]
          .filter(([key]) => key.startsWith(`${promptId}|`))
          .map(([, a]) => {
            const named = a.status === "answered" && isNamed(a);
            return {
              engine: a.engine,
              status: a.status,
              mentioned: named,
              position: named ? (a.brand?.listPosition ?? a.position) : null,
              ...(a.capturedAt ? { capturedAt: a.capturedAt } : {}),
              ...(a.reason ? { reason: a.reason } : {}),
            };
          }),
      };
    }),
    totalCitations: current.allCitations,
    sources: topWithYou(sourceRows, 8),
    citedPageCount: pages.size,
    pages: ranked(pages)
      .slice(0, 5)
      .map(([url, n]) => ({ url, title: titles.get(url) ?? "", citations: n })),
  };
}

/**
 * One prompt's checks over the window: a grid cell per day and engine, where an answered check
 * wins its cell so the grid agrees with domainVisibility, plus each engine's newest answers.
 */
export function promptHistory(
  projectId: string,
  promptId: string,
  runs: readonly TrackingRun[],
  subject: { brand: string; hostname: string },
  today: string,
  windowDays = 30,
): PromptHistory {
  const from = windowStart(today, windowDays);
  const onDomain = domainMatcher(subject.hostname);
  const history = new Map<string, PromptHistory["history"][number]>();
  const latest = new Map<TrackingAnswer["engine"], { day: string; answer: TrackingAnswer }>();
  const answered = new Map<TrackingAnswer["engine"], { day: string; answer: TrackingAnswer }>();
  for (const run of runs) {
    if (run.day < from || run.day > today) continue;
    for (const answer of run.answers) {
      if (answer.promptId !== promptId) continue;
      const key = `${run.day}|${answer.engine}`;
      const isAnswer = answer.status === "answered";
      const { search: _search, ...lean } = answer;
      latest.set(answer.engine, { day: run.day, answer: lean });
      if (isAnswer) answered.set(answer.engine, { day: run.day, answer: lean });
      if (!isAnswer && history.get(key)?.status === "answered") continue;
      const mentioned = isAnswer && isNamed(answer);
      history.set(key, {
        day: run.day,
        engine: answer.engine,
        status: answer.status,
        mentioned,
        position: mentioned ? (answer.brand?.listPosition ?? answer.position) : null,
        cited:
          (answer.domain?.citedAt.length ?? 0) > 0 || linksOf(answer).some((l) => onDomain(l.host)),
        ...(answer.reason ? { reason: answer.reason } : {}),
      });
    }
  }
  return {
    projectId,
    promptId,
    from,
    to: today,
    history: [...history.values()].toSorted((a, b) => a.day.localeCompare(b.day)),
    latest: [...latest.values()],
    lastAnswered: [...latest.entries()].flatMap(([engine, newest]) => {
      const last = answered.get(engine);
      return newest.answer.status !== "answered" && last ? [last] : [];
    }),
  };
}

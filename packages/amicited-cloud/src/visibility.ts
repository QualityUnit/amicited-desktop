import * as Schema from "effect/Schema";
import type { TrackingAnswer, TrackingRun } from "./tracking.ts";

export const VisibilityDay = Schema.Struct({
  day: Schema.String,
  shareOfVoice: Schema.NullOr(Schema.Number),
  shareOfCitation: Schema.NullOr(Schema.Number),
});
/** One domain's AI visibility from this computer's checks, measured like the AmICited dashboard. */
export const DomainVisibility = Schema.Struct({
  projectId: Schema.String,
  /** The window's first and last local day, inclusive. */
  from: Schema.String,
  to: Schema.String,
  answers: Schema.Number,
  lastDay: Schema.NullOr(Schema.String),
  shareOfVoice: Schema.NullOr(Schema.Number),
  previousShareOfVoice: Schema.NullOr(Schema.Number),
  shareOfCitation: Schema.NullOr(Schema.Number),
  previousShareOfCitation: Schema.NullOr(Schema.Number),
  days: Schema.Array(VisibilityDay),
  brands: Schema.Array(
    Schema.Struct({ name: Schema.String, share: Schema.Number, you: Schema.Boolean }),
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
const shiftDay = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

interface Tally {
  mentions: number;
  allMentions: number;
  citations: number;
  allCitations: number;
}
const empty = (): Tally => ({ mentions: 0, allMentions: 0, citations: 0, allCitations: 0 });

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
  const from = shiftDay(today, 1 - windowDays);
  const previousFrom = shiftDay(from, -windowDays);
  const domain = bare(subject.hostname);
  const onDomain = (host: string) => !!host && (host === domain || host.endsWith(`.${domain}`));
  const brand = subject.brand.trim() || subject.hostname;
  const latest = new Map<string, { day: string; answer: TrackingAnswer }>();
  for (const run of runs)
    for (const answer of run.answers)
      if (answer.status === "answered" && run.day >= previousFrom && run.day <= today)
        latest.set(`${run.day}|${answer.promptId}|${answer.engine}`, { day: run.day, answer });

  const current = empty();
  const previous = empty();
  const byDay = new Map<string, Tally>();
  const brands = new Map<string, number>();
  for (const { day, answer } of latest.values()) {
    const named = answer.brand?.mentioned || answer.domain?.mentioned || answer.mentioned;
    const others = [...new Set(answer.competitorsMentioned)].filter(
      (name) => name.trim() && name.toLowerCase() !== brand.toLowerCase(),
    );
    const links = answer.sources
      ? answer.sources.map((s) => s.domain || hostOf(s.url))
      : answer.citations.map(hostOf);
    const add = (tally: Tally) => {
      tally.mentions += named ? 1 : 0;
      tally.allMentions += (named ? 1 : 0) + others.length;
      tally.citations += links.filter(onDomain).length;
      tally.allCitations += links.length;
    };
    if (day < from) {
      add(previous);
      continue;
    }
    add(current);
    add(byDay.get(day) ?? byDay.set(day, empty()).get(day)!);
    if (named) brands.set(brand, (brands.get(brand) ?? 0) + 1);
    for (const name of others) brands.set(name, (brands.get(name) ?? 0) + 1);
  }
  const days = [...byDay.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([day, t]) => ({
      day,
      shareOfVoice: pct(t.mentions, t.allMentions),
      shareOfCitation: pct(t.citations, t.allCitations),
    }));
  return {
    projectId,
    from,
    to: today,
    answers: [...latest.values()].filter((v) => v.day >= from).length,
    lastDay: days.at(-1)?.day ?? null,
    shareOfVoice: pct(current.mentions, current.allMentions),
    previousShareOfVoice: pct(previous.mentions, previous.allMentions),
    shareOfCitation: pct(current.citations, current.allCitations),
    previousShareOfCitation: pct(previous.citations, previous.allCitations),
    days,
    brands: [...brands.entries()]
      .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([name, count]) => ({
        name,
        share: pct(count, current.allMentions) ?? 0,
        you: name === brand,
      })),
  };
}

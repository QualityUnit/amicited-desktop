import { useState, type ReactNode } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import type { TrackingAnswer, TrackingEngine } from "@amicited/cloud-client/tracking";
import { marketingNavigate } from "@amicited/ui-marketing";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Collapsible, CollapsibleTrigger } from "../components/ui/collapsible";
import { countryName } from "./amicitedTracking";
import { EngineMark, markOf } from "./EngineMark";
import { engineLabel, failureCopy } from "./trackingPresentation";
import { dayLabel, dayOrToday, laterToday, when } from "./visibilityFormat";

type Dated = { day: string; answer: TrackingAnswer };
const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");
const hostOf = (url: string) => {
  try {
    return bare(new URL(url).hostname);
  } catch {
    return "";
  }
};
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The selected AI app's latest check: its answer, or why there is none and the last one that came back. */
export function AnswerPanel({
  engine,
  latest,
  lastAnswered,
  today,
  time,
  brand,
  hostname,
  canRun,
  onRun,
}: {
  engine: TrackingEngine;
  latest: Dated | undefined;
  lastAnswered: Dated | undefined;
  today: string;
  time: string;
  brand: string;
  hostname: string;
  canRun: boolean;
  onRun: () => void;
}) {
  const label = engineLabel(engine);
  if (!latest)
    return (
      <div className="p-4">
        <Block
          tone="neutral"
          title="Not asked yet."
          detail={`${label} joins at the next check, ${laterToday(time)} at ${time}.`}
          action={
            <Button variant="outline" size="xs" disabled={!canRun} onClick={onRun}>
              Run now
            </Button>
          }
        />
      </div>
    );
  if (latest.answer.status === "answered")
    return <AnswerView answer={latest.answer} today={today} brand={brand} hostname={hostname} />;
  const copy = failureCopy(latest.answer.status, engine, latest.answer.reason, {
    when: latest.day === today ? "today" : `on ${dayLabel(latest.day)}`,
    time,
  });
  const action = copy.action;
  const last = lastAnswered && markOf(lastAnswered.answer);
  return (
    <div className="flex flex-col">
      <div className="p-4 pb-0">
        <Block
          tone="warning"
          title={copy.title}
          detail={copy.detail}
          action={
            action && (
              <Button
                variant="outline"
                size="xs"
                disabled={action.kind === "run" && !canRun}
                onClick={
                  action.kind === "run" ? onRun : () => marketingNavigate("/marketing-settings")
                }
              >
                {action.label}
              </Button>
            )
          }
        />
      </div>
      {lastAnswered && last ? (
        <AnswerView
          answer={lastAnswered.answer}
          today={today}
          brand={brand}
          hostname={hostname}
          heading={
            <>
              <EngineMark latest={last} />
              <span className="font-semibold">
                Last answer:{" "}
                {last.mentioned
                  ? last.position
                    ? `named #${last.position}`
                    : "named"
                  : "not named"}
              </span>
              <span className="text-muted-foreground">
                ·{" "}
                {lastAnswered.answer.capturedAt
                  ? when(lastAnswered.answer.capturedAt, today)
                  : dayOrToday(lastAnswered.day, today)}
              </span>
            </>
          }
        />
      ) : (
        <p className="p-4 text-sm text-muted-foreground">
          No earlier answer from {label} in the last 30 days.
        </p>
      )}
    </div>
  );
}

function Block({
  tone,
  title,
  detail,
  action,
}: {
  tone: "warning" | "neutral";
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${tone === "warning" ? "border-warning/30 bg-warning/8" : "bg-muted/40"}`}
    >
      {tone === "warning" ? (
        <AlertTriangle className="size-4 shrink-0 text-warning" />
      ) : (
        <Clock className="size-4 shrink-0 text-muted-foreground" />
      )}
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{title}</span>{" "}
        <span className="text-muted-foreground">{detail}</span>
      </p>
      {action}
    </div>
  );
}

function AnswerView({
  answer,
  today,
  brand,
  hostname,
  heading,
}: {
  answer: TrackingAnswer;
  today: string;
  brand: string;
  hostname: string;
  heading?: ReactNode;
}) {
  const mark = markOf(answer);
  const text = answer.text ?? answer.excerpt;
  const domain = bare(hostname);
  const onDomain = (host: string) => !!host && (host === domain || host.endsWith(`.${domain}`));
  const sources = answer.sources
    ? answer.sources.toSorted((a, b) => a.position - b.position)
    : answer.citations.map((url, i) => ({
        url,
        title: hostOf(url),
        domain: hostOf(url),
        position: i + 1,
      }));
  const citedAt =
    answer.domain?.citedAt ??
    sources.filter((s) => onDomain(s.domain || hostOf(s.url))).map((s) => s.position);
  const others = [...new Set(answer.competitorsMentioned)].filter(
    (name) => name.trim() && name.toLowerCase() !== brand.toLowerCase(),
  );
  const lower = text.toLowerCase();
  const firstAt = (name: string) => {
    const i = lower.indexOf(name.toLowerCase());
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const brands = [
    ...others.map((name) => ({ name, you: false })),
    ...(mark.mentioned ? [{ name: brand, you: true }] : []),
  ].toSorted((a, b) =>
    firstAt(a.name) === firstAt(b.name) ? 0 : firstAt(a.name) < firstAt(b.name) ? -1 : 1,
  );
  const listed = text.split("\n").filter((line) => /^\s*\d+[.)]\s/.test(line)).length;
  const meta = [
    engineLabel(answer.engine),
    ...(answer.capturedAt ? [`checked ${when(answer.capturedAt, today)}`] : []),
    ...(answer.country ? [`asked from ${countryName(answer.country)}`] : []),
    ...(answer.webSearch ? ["searched the web"] : []),
  ].join(" · ");
  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="flex min-w-0 flex-col gap-3 p-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {heading ?? (
            <>
              <EngineMark latest={mark} />
              <span className="font-semibold">
                {mark.mentioned
                  ? mark.position
                    ? `Named, #${mark.position} in its list`
                    : "Named"
                  : "Not named"}
              </span>
              <span className="text-muted-foreground">· {meta}</span>
            </>
          )}
        </p>
        <HighlightedAnswer
          text={text}
          brand={brand}
          brandOffsets={answer.brand?.offsets ?? []}
          domain={domain}
          domainOffsets={answer.domain?.offsets ?? []}
          others={others}
        />
      </div>
      <aside className="flex flex-col gap-4 border-t p-4 text-sm lg:border-t-0 lg:border-l">
        <section className="flex flex-col gap-1">
          <h3 className="text-xs text-muted-foreground">Where you were listed</h3>
          <p>
            {!mark.mentioned ? (
              "Not in this answer."
            ) : mark.position ? (
              <>
                <span className="font-semibold">
                  #{mark.position}
                  {listed >= mark.position ? ` of ${listed}` : ""}
                </span>{" "}
                in the answer's list
              </>
            ) : (
              "Named, not in a list"
            )}
          </p>
          <p className="text-muted-foreground">
            {citedAt.length === 0
              ? "Your site is not among the sources."
              : citedAt.length === 1
                ? `Your site is linked once, as source ${citedAt[0]} of ${sources.length}.`
                : `Your site is linked ${citedAt.length} times, as sources ${citedAt.join(", ")} of ${sources.length}.`}
          </p>
        </section>
        <section className="flex flex-col gap-1.5 border-t pt-3">
          <h3 className="text-xs text-muted-foreground">Brands named · {brands.length}</h3>
          {brands.length ? (
            <ol className="flex flex-wrap gap-1.5">
              {brands.map((b, i) => (
                <li key={b.name}>
                  <Badge variant={b.you ? "info" : "outline"}>
                    <span className="text-muted-foreground">{i + 1}</span> {b.name}
                  </Badge>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground">No brands named.</p>
          )}
        </section>
        <section className="flex flex-col gap-1.5 border-t pt-3">
          <h3 className="text-xs text-muted-foreground">Sources it cited · {sources.length}</h3>
          {sources.length ? (
            <ol className="flex flex-col gap-2">
              {sources.map((s) => {
                const host = s.domain || hostOf(s.url);
                const you = onDomain(host);
                return (
                  <li key={`${s.position}:${s.url}`} className="flex gap-2">
                    <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {s.position}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`truncate hover:underline ${you ? "font-semibold text-primary" : ""}`}
                      >
                        {s.title || host}
                      </a>
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">{pathOf(s.url, host)}</span>
                        {you && (
                          <Badge variant="info" size="sm">
                            You
                          </Badge>
                        )}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-muted-foreground">
              {answer.webSearch === false
                ? `${engineLabel(answer.engine)} answered without searching the web.`
                : "No sources were shown."}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

const pathOf = (url: string, host: string) => {
  try {
    const u = new URL(url);
    return `${host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return host;
  }
};

/** Long answers start clamped; the brand and site are marked, other brands underlined. */
function HighlightedAnswer({
  text,
  brand,
  brandOffsets,
  domain,
  domainOffsets,
  others,
}: {
  text: string;
  brand: string;
  brandOffsets: readonly number[];
  domain: string;
  domainOffsets: readonly number[];
  others: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const long = text.split("\n").length > 14 || text.length > 1400;
  const ranges = [
    ...brandOffsets.map((start) => ({ start, end: start + brand.length, you: true })),
    ...domainOffsets.map((start) => ({ start, end: start + domain.length, you: true })),
    ...(others.length
      ? [
          ...text.matchAll(
            new RegExp(
              `(?<![\\p{L}\\p{N}])(?:${others.map(escape).join("|")})(?![\\p{L}\\p{N}])`,
              "giu",
            ),
          ),
        ].map((m) => ({ start: m.index, end: m.index + m[0].length, you: false }))
      : []),
  ].toSorted((a, b) => a.start - b.start || Number(b.you) - Number(a.you));
  const parts: ReactNode[] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start < at || r.end > text.length) continue;
    if (r.start > at) parts.push(text.slice(at, r.start));
    const word = text.slice(r.start, r.end);
    parts.push(
      r.you ? (
        <mark key={r.start} className="rounded-sm bg-primary/15 px-0.5 font-semibold text-primary">
          {word}
        </mark>
      ) : (
        <span key={r.start} className="underline decoration-dotted underline-offset-4">
          {word}
        </span>
      ),
    );
    at = r.end;
  }
  parts.push(text.slice(at));
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-col items-start gap-3">
        <p
          className={`text-sm leading-relaxed whitespace-pre-wrap ${open || !long ? "" : "line-clamp-14"}`}
        >
          {text ? parts : "The answer was empty."}
        </p>
        {long && (
          <CollapsibleTrigger render={<Button size="xs" variant="outline" />}>
            {open ? "Show less" : "Show full answer"}
          </CollapsibleTrigger>
        )}
      </div>
    </Collapsible>
  );
}

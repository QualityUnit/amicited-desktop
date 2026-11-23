import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { TrackingConfig, TrackingEngine, TrackingRun } from "@amicited/cloud-client/tracking";
import type { DomainVisibility } from "@amicited/cloud-client/visibility";
import { marketingNavigate } from "@amicited/ui-marketing";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Toggle, ToggleGroup } from "../components/ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { engineLabel } from "./trackingPresentation";
import { change, dayLabel, percent, plural } from "./visibilityFormat";

type Metric = "shareOfVoice" | "shareOfCitation" | "mentionRate";
const metrics = {
  shareOfVoice: {
    label: "Share of voice",
    hint: "Your mentions out of every brand mention",
    previous: "previousShareOfVoice",
  },
  shareOfCitation: {
    label: "Share of citation",
    hint: "Links to your site out of every cited link",
    previous: "previousShareOfCitation",
  },
  mentionRate: {
    label: "Mention rate",
    hint: "Answers that name you",
    previous: "previousMentionRate",
  },
} as const;

export function VisibilityDashboard({
  visibility,
  config,
  run,
  engines,
  brand,
  hostname,
}: {
  visibility: DomainVisibility;
  config: TrackingConfig;
  run: TrackingRun | undefined;
  /** Engines that can be checked now; the rest wait for a connection. */
  engines: readonly TrackingEngine[];
  brand: string;
  hostname: string;
}) {
  const [metric, setMetric] = useState<Metric>("shareOfVoice");
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(metrics) as Metric[]).map((key) => (
          <MetricTile
            key={key}
            label={metrics[key].label}
            value={percent(visibility[key])}
            delta={change(visibility[key], visibility[metrics[key].previous])}
            detail={
              visibility[key] === null
                ? metrics[key].hint
                : key === "mentionRate"
                  ? `named in ${visibility.mentioned} of ${visibility.answers} answers`
                  : null
            }
            selected={metric === key}
            onSelect={() => setMetric(key)}
          />
        ))}
        <MetricTile
          label="Average position"
          value={visibility.averagePosition === null ? "–" : `#${visibility.averagePosition}`}
          delta={change(visibility.previousAveragePosition, visibility.averagePosition)}
          unit="better"
          detail={
            visibility.averagePosition === null
              ? "Your rank when an answer is a list"
              : `when listed, ${plural(visibility.positioned, "answer")}`
          }
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <Card
          title={`${metrics[metric].label} over time`}
          subtitle={`${metrics[metric].hint}, per checked day`}
        >
          <TrendChart
            visibility={visibility}
            metric={metric}
            previous={visibility[metrics[metric].previous]}
          />
        </Card>
        <Card
          title="Brands in the answers"
          subtitle={
            visibility.brands.find((b) => b.you)
              ? `You are #${visibility.brands.find((b) => b.you)!.rank} of ${visibility.brandCount} brands named`
              : `${plural(visibility.brandCount, "brand")} named, not yet ${brand}`
          }
        >
          {visibility.brands.length ? (
            <ol className="flex flex-col gap-2">
              {visibility.brands.map((b) => (
                <BarRow
                  key={b.name}
                  rank={b.rank}
                  label={b.name}
                  you={b.you}
                  share={b.share}
                  value={percent(b.share)}
                  trailing={
                    b.previousShare === null ? (
                      "new"
                    ) : (
                      <Delta value={change(b.share, b.previousShare)} quiet={!b.you} />
                    )
                  }
                />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No brands named yet.</p>
          )}
        </Card>
      </div>
      <EngineTable visibility={visibility} config={config} run={run} available={engines} />
      <PromptTable visibility={visibility} config={config} />
      <div className="grid gap-3 lg:grid-cols-2">
        <Card
          title="Sources the answers cite"
          subtitle={`${visibility.totalCitations} links across ${plural(visibility.answers, "answer")}`}
        >
          {visibility.sources.length ? (
            <ol className="flex flex-col gap-2">
              {visibility.sources.map((s) => (
                <BarRow
                  key={s.domain}
                  label={s.domain}
                  you={s.you}
                  share={s.share}
                  value={`${s.citations}`}
                  trailing={percent(s.share)}
                />
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No answer has cited a source yet.</p>
          )}
        </Card>
        <Card
          title="Your pages they cite"
          subtitle={`${plural(visibility.citedPageCount, "page")} on ${hostname} linked`}
        >
          {visibility.pages.length ? (
            <ol className="flex flex-col gap-2.5">
              {visibility.pages.map((p) => (
                <li key={p.url} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-primary hover:underline"
                    >
                      {pathOf(p.url)}
                    </a>
                    {p.title && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.title}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{p.citations}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              No answer has linked to {hostname} yet. Pages that answer a tracked question directly
              are the ones that get cited.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}

const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
};

function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

function Delta({
  value,
  unit = "pts",
  quiet = false,
}: {
  value: number | null;
  unit?: string;
  quiet?: boolean;
}) {
  if (value === null) return null;
  if (Math.abs(value) < 0.05) return <span className="text-muted-foreground">no change</span>;
  const tone = quiet ? "text-muted-foreground" : value > 0 ? "text-success" : "text-destructive";
  return (
    <span className={`tabular-nums ${tone}`}>
      {value > 0 ? "▲" : "▼"} {Math.abs(value).toFixed(1)} {unit}
    </span>
  );
}

function MetricTile({
  label,
  value,
  delta,
  unit = "pts",
  detail,
  selected,
  onSelect,
}: {
  label: string;
  value: string;
  delta: number | null;
  unit?: string;
  detail: string | null;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <>
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-2xl font-semibold tabular-nums">{value}</span>
      <span className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
        {delta !== null ? (
          <>
            <Delta value={delta} unit={unit === "better" ? "" : unit} />
            {unit === "better" && Math.abs(delta) >= 0.05 && (delta > 0 ? "better" : "worse")}
            {detail ? ` · ${detail}` : " vs previous 30 days"}
          </>
        ) : (
          (detail ?? "First 30 days, nothing to compare yet")
        )}
      </span>
    </>
  );
  const frame = `rounded-xl border bg-card p-3 text-left ${selected ? "border-primary ring-1 ring-primary" : ""}`;
  return onSelect ? (
    <button type="button" aria-pressed={selected} className={frame} onClick={onSelect}>
      {body}
    </button>
  ) : (
    <div className={frame}>{body}</div>
  );
}

function BarRow({
  rank,
  label,
  you,
  share,
  value,
  trailing,
}: {
  rank?: number;
  label: string;
  you: boolean;
  share: number;
  value: string;
  trailing: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1fr_auto_4rem] items-center gap-x-3 text-sm">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {rank !== undefined && (
            <span className="w-4 text-xs tabular-nums text-muted-foreground">{rank}</span>
          )}
          <span className={`truncate ${you ? "font-medium" : ""}`}>{label}</span>
          {you && (
            <Badge variant="info" size="sm">
              You
            </Badge>
          )}
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-muted">
          <span
            className={`block h-full rounded-full ${you ? "bg-primary" : "bg-muted-foreground/40"}`}
            style={{ width: `${Math.min(100, share)}%` }}
          />
        </span>
      </span>
      <span className={`tabular-nums ${you ? "font-medium" : ""}`}>{value}</span>
      <span className="text-right text-xs text-muted-foreground">{trailing}</span>
    </li>
  );
}

const niceTop = (max: number) => {
  const target = Math.max(10, max * 1.25);
  const step = target <= 20 ? 5 : target <= 50 ? 10 : 25;
  return Math.min(100, Math.ceil(target / step) * step);
};
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** One series over the window on an axis fitted to the data, with the previous period as a reference. */
function TrendChart({
  visibility,
  metric,
  previous,
}: {
  visibility: DomainVisibility;
  metric: Metric;
  previous: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const series = visibility.days.flatMap((d) =>
    d[metric] === null ? [] : [{ day: d.day, answers: d.answers, value: d[metric]! }],
  );
  if (series.length < 2) {
    const only = series[0];
    return (
      <div className="flex h-44 flex-col items-center justify-center rounded-lg border border-dashed text-center text-sm">
        {only && (
          <span className="font-medium">
            {percent(only.value)} on {dayLabel(only.day)}
          </span>
        )}
        <span className="text-muted-foreground">The trend appears after the next check.</span>
      </div>
    );
  }
  const width = 640;
  const height = 190;
  const pad = { left: 36, right: 44, top: 10, bottom: 22 };
  const top = niceTop(Math.max(...series.map((p) => p.value), previous ?? 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f * 10) / 10);
  const span = Math.max(1, daysBetween(visibility.from, visibility.to));
  const x = (day: string) =>
    pad.left + (daysBetween(visibility.from, day) / span) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - value / top) * (height - pad.top - pad.bottom);
  const points = series.map((p) => ({ ...p, x: x(p.day), y: y(p.value) }));
  const last = points.at(-1)!;
  const active = hover === null ? null : points[hover];
  const label = metrics[metric].label;
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full text-muted-foreground"
        role="img"
        aria-label={`${label} by day, last 30 days`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="currentColor"
              strokeOpacity={tick === 0 ? 0.4 : 0.12}
            />
            <text
              x={pad.left - 6}
              y={y(tick) + 4}
              textAnchor="end"
              fontSize="10"
              fill="currentColor"
            >
              {tick}%
            </text>
          </g>
        ))}
        {[visibility.from, visibility.to].map((day, i) => (
          <text
            key={day}
            x={x(day)}
            y={height - 6}
            textAnchor={i ? "end" : "start"}
            fontSize="10"
            fill="currentColor"
          >
            {dayLabel(day)}
          </text>
        ))}
        {previous !== null && (
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(previous)}
            y2={y(previous)}
            stroke="currentColor"
            strokeOpacity={0.5}
            strokeDasharray="4 4"
          />
        )}
        <polygon
          points={`${points[0]!.x},${y(0)} ${points.map((p) => `${p.x},${p.y}`).join(" ")} ${last.x},${y(0)}`}
          fill="var(--primary)"
          fillOpacity={0.08}
        />
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--primary)" />
        <text x={last.x + 8} y={last.y + 4} fontSize="11" fontWeight={600} fill="var(--foreground)">
          {last.value.toFixed(1)}%
        </text>
        {active && (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="currentColor"
              strokeOpacity={0.3}
            />
            <circle cx={active.x} cy={active.y} r={4} fill="var(--primary)" />
          </>
        )}
        {points.map((p, i) => (
          <rect
            key={p.day}
            x={p.x - 8}
            y={pad.top}
            width={16}
            height={height - pad.top - pad.bottom}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      <figcaption
        className="flex h-4 justify-between text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span>
          {active
            ? `${dayLabel(active.day)} · ${plural(active.answers, "answer")} · ${label} ${active.value.toFixed(1)}%`
            : ""}
        </span>
        {previous !== null && <span>- - Previous 30 days · {percent(previous)}</span>}
      </figcaption>
    </figure>
  );
}

const lastCheck = (run: TrackingRun | undefined, engine: TrackingEngine) => {
  const asked = run?.answers.filter((a) => a.engine === engine) ?? [];
  return asked.length
    ? { asked: asked.length, answered: asked.filter((a) => a.status === "answered").length }
    : null;
};

function EngineTable({
  visibility,
  config,
  run,
  available,
}: {
  visibility: DomainVisibility;
  config: TrackingConfig;
  run: TrackingRun | undefined;
  available: readonly TrackingEngine[];
}) {
  const checked = config.engines.filter((e) => available.includes(e));
  const rows = checked.toSorted(
    (a, b) =>
      (visibility.engines.find((r) => r.engine === b)?.mentionRate ?? -1) -
      (visibility.engines.find((r) => r.engine === a)?.mentionRate ?? -1),
  );
  const waiting = config.engines.filter((e) => !available.includes(e));
  return (
    <Card title="By AI app" subtitle="How each AI app treats you over the last 30 days">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>AI app</TableHead>
            <TableHead>Mention rate</TableHead>
            <TableHead>Named in</TableHead>
            <TableHead>Links to you in</TableHead>
            <TableHead>Avg position</TableHead>
            <TableHead>vs previous 30 days</TableHead>
            <TableHead className="text-right">Last check</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((engine) => {
            const r = visibility.engines.find((e) => e.engine === engine);
            const check = lastCheck(run, engine);
            return (
              <TableRow key={engine}>
                <TableCell>
                  <span className="font-medium">{engineLabel(engine)}</span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${r?.mentionRate ?? 0}%` }}
                      />
                    </span>
                    <span className="tabular-nums">{percent(r?.mentionRate ?? null)}</span>
                  </span>
                </TableCell>
                <TableCell>
                  <span className="tabular-nums">{r ? `${r.mentioned} of ${r.answers}` : "–"}</span>
                </TableCell>
                <TableCell>
                  <span className="tabular-nums">{r ? plural(r.cited, "answer") : "–"}</span>
                </TableCell>
                <TableCell>
                  <span className="tabular-nums">
                    {r?.averagePosition != null ? `#${r.averagePosition}` : "–"}
                  </span>
                </TableCell>
                <TableCell>
                  <Delta value={change(r?.mentionRate ?? null, r?.previousMentionRate ?? null)} />
                </TableCell>
                <TableCell className="text-right">
                  {check && (
                    <Badge variant={check.answered === check.asked ? "success" : "warning"}>
                      {check.answered} of {check.asked}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {waiting.map((engine) => (
            <TableRow key={engine}>
              <TableCell>
                <span className="text-muted-foreground">{engineLabel(engine)}</span>
              </TableCell>
              <TableCell colSpan={5}>
                <span className="text-muted-foreground">
                  Needs your sign-in before it can be checked.
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => marketingNavigate("/marketing-settings")}
                >
                  Connect
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

type PromptFilter = "all" | "losing" | "winning";
const winning = (rate: number | null) => rate !== null && rate >= 50;

function PromptTable({
  visibility,
  config,
}: {
  visibility: DomainVisibility;
  config: TrackingConfig;
}) {
  const [filter, setFilter] = useState<PromptFilter>("all");
  const rows = config.prompts
    .filter((p) => p.enabled)
    .map((prompt) => ({
      prompt,
      data: visibility.prompts.find((r) => r.promptId === prompt.id),
    }))
    .toSorted((a, b) => (a.data?.mentionRate ?? Infinity) - (b.data?.mentionRate ?? Infinity));
  const counts = {
    all: rows.length,
    losing: rows.filter((r) => r.data?.answers && !winning(r.data.mentionRate)).length,
    winning: rows.filter((r) => winning(r.data?.mentionRate ?? null)).length,
  };
  const shown = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "winning"
        ? winning(r.data?.mentionRate ?? null)
        : !!r.data?.answers && !winning(r.data.mentionRate),
  );
  const open = () => marketingNavigate(`/prompts?site=${encodeURIComponent(visibility.projectId)}`);
  return (
    <Card
      title="Prompts"
      subtitle="Weakest first. Marks show each AI app's latest check."
      actions={
        <div className="flex items-center gap-2">
          <ToggleGroup
            aria-label="Show prompts"
            value={[filter]}
            onValueChange={(values) => {
              const next = values[0] as PromptFilter | undefined;
              if (next) setFilter(next);
            }}
          >
            <Toggle value="all">All {counts.all}</Toggle>
            <Toggle value="losing">Losing {counts.losing}</Toggle>
            <Toggle value="winning">Winning {counts.winning}</Toggle>
          </ToggleGroup>
          <Button variant="ghost" size="xs" onClick={open}>
            Prompts and answers <ChevronRight />
          </Button>
        </div>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prompt</TableHead>
            {config.engines.map((e) => (
              <TableHead key={e} className="text-center">
                {engineLabel(e)}
              </TableHead>
            ))}
            <TableHead>Named in, 30 days</TableHead>
            <TableHead>Named instead</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map(({ prompt, data }) => (
            <TableRow key={prompt.id} className="cursor-pointer" onClick={open}>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger render={<span className="block max-w-80 truncate" />}>
                    {prompt.text}
                  </TooltipTrigger>
                  <TooltipPopup>{prompt.text}</TooltipPopup>
                </Tooltip>
              </TableCell>
              {config.engines.map((e) => (
                <TableCell key={e} className="text-center">
                  <EngineMark latest={data?.latest.find((l) => l.engine === e)} />
                </TableCell>
              ))}
              <TableCell>
                {data?.answers ? (
                  <span className="flex items-center gap-2 tabular-nums">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${data.mentionRate ?? 0}%` }}
                      />
                    </span>
                    {data.mentioned} of {data.answers}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Not asked yet</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-muted-foreground">{data?.namedInstead ?? "–"}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <EngineMark latest={{ status: "answered", mentioned: true, position: null }} /> Named
          (with its list position)
        </span>
        <span className="flex items-center gap-1.5">
          <EngineMark latest={{ status: "answered", mentioned: false, position: null }} /> Not named
        </span>
        <span className="flex items-center gap-1.5">
          <EngineMark latest={{ status: "failed", mentioned: false, position: null }} /> Could not
          run
        </span>
      </p>
    </Card>
  );
}

/** Shape as well as colour: disc named, ring not named, square could not run. */
function EngineMark({
  latest,
}: {
  latest: { status: string; mentioned: boolean; position: number | null } | undefined;
}) {
  if (!latest) return <span className="inline-block size-4" aria-label="Not asked yet" />;
  if (latest.status !== "answered")
    return (
      <span
        aria-label="Could not run"
        className="inline-flex size-4 items-center justify-center rounded-sm bg-warning/20 text-3xs font-bold text-warning-foreground"
      >
        !
      </span>
    );
  if (!latest.mentioned)
    return (
      <span
        aria-label="Not named"
        className="inline-block size-4 rounded-full border-2 border-muted-foreground/40"
      />
    );
  return (
    <span
      aria-label={latest.position ? `Named at #${latest.position}` : "Named"}
      className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-3xs font-semibold text-primary-foreground"
    >
      {latest.position ?? ""}
    </span>
  );
}

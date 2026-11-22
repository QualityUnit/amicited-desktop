import { useEffect, useEffectEvent, useState } from "react";
import { ScanEye } from "lucide-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { availableEngines, type TrackingRun } from "@amicited/cloud-client/tracking";
import type { DomainVisibility } from "@amicited/cloud-client/visibility";
import type { Domain } from "@amicited/cloud-client/domains";
import { marketingNavigate } from "@amicited/ui-marketing";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useDomains } from "../marketingDomains";
import { Button } from "../components/ui/button";
import { SidebarMenuButton } from "../components/ui/sidebar";
import { SyncStatus, useTracking } from "./amicitedTracking";
import { useConnections } from "./amicitedConnections";
import { SetupTrackingPrompts } from "./SetupTrackingPrompts";

const visibilityCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tracking.visibility",
  label: "tracking:visibility",
});

const configured = (tracking: ReturnType<typeof useTracking>, projectId: string) =>
  tracking.snapshot.configs.some(
    (c) => c.projectId === projectId && c.prompts.some((p) => p.enabled),
  );

/** Sits under Issues; says "Set up" until a website tracks prompts. */
export function AiVisibilitySidebarRow({
  active,
  onOpen,
}: {
  active: boolean;
  onOpen: () => void;
}) {
  const environmentId = usePrimaryEnvironmentId();
  const tracking = useTracking(environmentId ?? undefined);
  const domains = useDomains(environmentId);
  const needsSetup =
    tracking.loaded &&
    domains.rows.length > 0 &&
    !domains.rows.some((d) => configured(tracking, d.projectId));
  return (
    <div className="px-2 pb-1">
      <SidebarMenuButton
        isActive={active}
        render={<a href="/visibility" />}
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
      >
        <ScanEye />
        <span className="flex-1">AI Visibility</span>
        {needsSetup && <span className="text-xs text-muted-foreground">Set up</span>}
      </SidebarMenuButton>
    </div>
  );
}

function useVisibility(environmentId: EnvironmentId | null, refreshKey: string) {
  const read = useEffectEvent(useAtomCommand(visibilityCommand));
  const [rows, setRows] = useState<readonly DomainVisibility[] | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Rereads the server's computed shares whenever a tracking run changes.
  useEffect(() => {
    if (!environmentId) return;
    let active = true;
    void read({ environmentId, input: {} }).then((r) => {
      if (active && r._tag === "Success") setRows(r.value);
    });
    return () => {
      active = false;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A tracking run changing is what changes the shares, so it rereads them.
  }, [environmentId, refreshKey]);
  return rows;
}

export function AiVisibilityPage() {
  const environmentId = usePrimaryEnvironmentId();
  const domains = useDomains(environmentId);
  const tracking = useTracking(environmentId ?? undefined);
  const refreshKey = tracking.snapshot.runs
    .map((r) => `${r.id}:${r.status}:${r.answered ?? r.answers.length}`)
    .join(";");
  const visibility = useVisibility(environmentId, refreshKey);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">AI Visibility</h1>
        <p className="text-sm text-muted-foreground">
          How AI answers name and cite your websites, from the checks on this computer over the last
          30 days.
        </p>
      </header>
      {!domains.loaded || !tracking.loaded ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading AI visibility…
        </p>
      ) : domains.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a website to track its AI visibility.</p>
      ) : (
        environmentId &&
        domains.rows.map((domain) => (
          <DomainVisibilityCard
            key={domain.projectId}
            domain={domain}
            environmentId={environmentId}
            tracking={tracking}
            visibility={visibility?.find((v) => v.projectId === domain.projectId) ?? null}
          />
        ))
      )}
    </div>
  );
}

function DomainVisibilityCard({
  domain,
  environmentId,
  tracking,
  visibility,
}: {
  domain: Domain;
  environmentId: EnvironmentId;
  tracking: ReturnType<typeof useTracking>;
  visibility: DomainVisibility | null;
}) {
  const connections = useConnections(environmentId);
  const [settingUp, setSettingUp] = useState(false);
  const config = tracking.snapshot.configs.find((c) => c.projectId === domain.projectId);
  const sync = tracking.snapshot.sync?.find((s) => s.projectId === domain.projectId);
  const latest = tracking.snapshot.runs.find((r) => r.projectId === domain.projectId);
  const running = latest?.status === "running";
  const run = () => void tracking.run({ environmentId, input: { projectId: domain.projectId } });
  const openPrompts = () =>
    marketingNavigate(`/prompts?site=${encodeURIComponent(domain.projectId)}`);
  const brand = domain.brand || domain.hostname;
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{domain.hostname}</h2>
          {config && (
            <p className="text-xs text-muted-foreground">
              {plural(config.prompts.filter((p) => p.enabled).length, "prompt")} · checked daily at{" "}
              {config.time} on this computer
            </p>
          )}
        </div>
        {config && !settingUp && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openPrompts}>
              Prompts and answers
            </Button>
            <Button size="sm" disabled={!tracking.canRun || running} onClick={run}>
              {running ? "Checking…" : "Run now"}
            </Button>
          </div>
        )}
      </header>
      {settingUp ? (
        <SetupTrackingPrompts
          domain={domain}
          destination={environmentId}
          engines={availableEngines(connections.snapshot.connections)}
          initialPrompts={[]}
          onBack={() => setSettingUp(false)}
          onComplete={async (saved) => {
            if (saved)
              await tracking.run({ environmentId, input: { projectId: domain.projectId } });
            setSettingUp(false);
          }}
        />
      ) : !config || !config.prompts.some((p) => p.enabled) ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm">
            See how often ChatGPT, Gemini, Perplexity and Google name {brand} and cite{" "}
            {domain.hostname} when your buyers ask. Your assistant suggests the questions; the
            checks run on this computer, up to 20 prompts a day, free.
          </p>
          <Button disabled={!tracking.canSave} onClick={() => setSettingUp(true)}>
            Set up AI visibility
          </Button>
        </div>
      ) : !visibility || visibility.answers === 0 ? (
        <p className="text-sm text-muted-foreground">
          {running
            ? "The first check is running on this computer. Results appear here as answers arrive."
            : `No answers yet. The first check runs at ${config.time}, or run it now.`}
        </p>
      ) : (
        <VisibilityResults visibility={visibility} />
      )}
      {config && latest && <RunStatus run={latest} />}
      {config && <SyncStatus sync={sync} />}
    </section>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What the latest check did, so a slow or failing run is visible rather than a frozen button. */
function RunStatus({ run }: { run: TrackingRun }) {
  const failed = run.answers.filter((a) => a.status !== "answered");
  const reason = failed.findLast((a) => a.reason)?.reason;
  const problem =
    failed.length > 0
      ? `${plural(failed.length, "check")} could not run${reason ? `: ${reason}` : "."}`
      : null;
  if (run.status === "running")
    return (
      <p className="text-xs text-muted-foreground">
        Checking now: {run.answers.length} of {run.total} done.
        {problem && <span className="text-destructive"> {problem}</span>}
      </p>
    );
  if (!problem && run.status === "complete") return null;
  const answered = run.answers.length - failed.length;
  return (
    <p className="text-xs text-destructive">
      Last check ({run.day}): {answered} of {run.total} answered.{" "}
      {problem ?? (run.status === "complete" ? "" : "It stopped before finishing.")}
    </p>
  );
}

type Metric = "shareOfVoice" | "shareOfCitation";
const metrics: { key: Metric; label: string; hint: string }[] = [
  { key: "shareOfVoice", label: "Share of voice", hint: "Your mentions of all brand mentions" },
  { key: "shareOfCitation", label: "Share of citation", hint: "Links to your site of all links" },
];
const previousOf = {
  shareOfVoice: "previousShareOfVoice",
  shareOfCitation: "previousShareOfCitation",
} as const;

function VisibilityResults({ visibility }: { visibility: DomainVisibility }) {
  const [metric, setMetric] = useState<Metric>("shareOfVoice");
  const label = metrics.find((m) => m.key === metric)!.label;
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_220px]">
      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label="Metric" className="grid grid-cols-2 gap-2">
          {metrics.map((m) => {
            const value = visibility[m.key];
            const previous = visibility[previousOf[m.key]];
            return (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={metric === m.key}
                onClick={() => setMetric(m.key)}
                className={`rounded-lg border p-3 text-left ${metric === m.key ? "border-primary" : ""}`}
              >
                <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {m.label}
                </span>
                <span className="block text-2xl font-semibold tabular-nums">
                  {value === null ? "–" : `${value.toFixed(1)}%`}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {value === null
                    ? m.hint
                    : previous === null
                      ? "No previous data"
                      : `${value - previous >= 0 ? "+" : ""}${(value - previous).toFixed(1)} pts vs previous 30 days`}
                </span>
              </button>
            );
          })}
        </div>
        <ShareChart visibility={visibility} metric={metric} label={label} />
        <p className="text-xs text-muted-foreground">
          {visibility.answers} answers in the last 30 days
          {visibility.lastDay ? ` · last answer ${dayLabel(visibility.lastDay)}` : ""}
        </p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Top brands</h3>
        {visibility.brands.length ? (
          <ol className="flex flex-col gap-1.5 text-sm">
            {visibility.brands.map((b) => (
              <li key={b.name} className="flex items-center justify-between gap-2">
                <span className={b.you ? "font-medium" : ""}>
                  {b.name}
                  {b.you && <span className="ml-1 text-xs text-muted-foreground">you</span>}
                </span>
                <span className="tabular-nums text-muted-foreground">{b.share.toFixed(1)}%</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No brands named yet.</p>
        )}
      </div>
    </div>
  );
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** One series over the 30-day window, 0–100%, with a hover readout per checked day. */
function ShareChart({
  visibility,
  metric,
  label,
}: {
  visibility: DomainVisibility;
  metric: Metric;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const height = 180;
  const pad = { left: 36, right: 12, top: 10, bottom: 24 };
  const span = Math.max(1, daysBetween(visibility.from, visibility.to));
  const x = (day: string) =>
    pad.left + (daysBetween(visibility.from, day) / span) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - value / 100) * (height - pad.top - pad.bottom);
  const points = visibility.days.flatMap((d) =>
    d[metric] === null ? [] : [{ day: d.day, value: d[metric]!, x: x(d.day), y: y(d[metric]!) }],
  );
  const active = hover === null ? null : points[hover];
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full text-muted-foreground"
        role="img"
        aria-label={`${label} by day, last 30 days`}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 25, 50, 75, 100].map((tick) => (
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
        {points.length > 1 && (
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {active && (
          <line
            x1={active.x}
            x2={active.x}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
        )}
        {points.map((p, i) => (
          <g key={p.day} onMouseEnter={() => setHover(i)}>
            <rect
              x={p.x - 12}
              y={pad.top}
              width={24}
              height={height - pad.top - pad.bottom}
              fill="transparent"
            />
            <circle
              cx={p.x}
              cy={p.y}
              r={hover === i ? 5 : 4}
              fill="var(--primary)"
              stroke="var(--background)"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
      <figcaption className="h-4 text-xs text-muted-foreground" aria-live="polite">
        {active ? `${dayLabel(active.day)} · ${label} ${active.value.toFixed(1)}%` : ""}
      </figcaption>
    </figure>
  );
}

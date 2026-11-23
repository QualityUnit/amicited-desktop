import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Info, Minus } from "lucide-react";
import type { TrackingEngine, TrackingRun, TrackingSync } from "@amicited/cloud-client/tracking";
import { marketingNavigate } from "@amicited/ui-marketing";
import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { failureCopy } from "./trackingPresentation";
import { dayLabel, laterToday, plural, when } from "./visibilityFormat";

const upgradeUrl = "https://app.flowhunt.io/amicited/subscription";
/** About how long a check takes: one answer plus the pause before the next ask. */
const secondsPerCheck = 25;

/** Run state on the left, sync on the right, and one row per thing the user can fix. */
export function VisibilityStatus({
  run,
  sync,
  time,
  canRun,
  onRun,
  onStop,
  firstCheck,
}: {
  run: TrackingRun | undefined;
  sync: TrackingSync | undefined;
  time: string;
  canRun: boolean;
  onRun: () => void;
  onStop: () => void;
  /** Before any check: the prompts and AI apps the first one will ask. */
  firstCheck?: { prompts: number; engines: number } | undefined;
}) {
  const rows = [...(run && run.status !== "running" ? failureRows(run, canRun, onRun) : [])];
  const overLimit = sync?.overLimit ?? 0;
  if (overLimit)
    rows.push(
      <AttentionRow
        key="limit"
        tone="info"
        title={`${overLimit === 1 ? "1 prompt isn't" : `${overLimit} prompts aren't`} in your AmICited dashboard.`}
        detail="Your plan's prompt limit is reached. They still run here."
        action={
          <Button
            variant="outline"
            size="xs"
            render={<a href={upgradeUrl} target="_blank" rel="noreferrer" />}
          >
            Upgrade plan
          </Button>
        }
      />,
    );
  else if (sync?.skipped)
    rows.push(
      <AttentionRow
        key="skipped"
        tone="info"
        title={`${plural(sync.skipped, "answer")} weren't accepted by AmICited.`}
        detail="They stay on this computer."
      />,
    );
  return (
    <section aria-label="Check status" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
        <RunLine
          run={run}
          time={time}
          canRun={canRun}
          onRun={onRun}
          onStop={onStop}
          firstCheck={firstCheck}
        />
        <SyncLine sync={sync} />
      </div>
      {rows.length > 0 && <div className="flex flex-col border-t">{rows}</div>}
    </section>
  );
}

function RunLine({
  run,
  time,
  canRun,
  onRun,
  onStop,
  firstCheck,
}: {
  run: TrackingRun | undefined;
  time: string;
  canRun: boolean;
  onRun: () => void;
  onStop: () => void;
  firstCheck: { prompts: number; engines: number } | undefined;
}) {
  if (!run && firstCheck)
    return (
      <span className="flex flex-1 items-center gap-2">
        <Clock className="size-4 text-muted-foreground" />
        <span className="font-medium">
          The first check runs {laterToday(time)} at {time}
        </span>
        <span className="text-muted-foreground">
          about{" "}
          {plural(
            Math.max(
              1,
              Math.ceil((firstCheck.prompts * firstCheck.engines * secondsPerCheck) / 60),
            ),
            "minute",
          )}{" "}
          for {plural(firstCheck.prompts, "prompt")}
        </span>
        <Button size="xs" disabled={!canRun} onClick={onRun}>
          Run now
        </Button>
      </span>
    );
  if (!run)
    return (
      <span className="flex-1 text-muted-foreground">
        The first check runs daily at {time} on this computer.
      </span>
    );
  const answered = run.answers.filter((a) => a.status === "answered").length;
  const lastAt = run.answers.findLast((a) => a.capturedAt)?.capturedAt;
  if (run.status === "running") {
    const done = run.total ? Math.round((run.answers.length / run.total) * 100) : 0;
    return (
      <span className="flex flex-1 items-center gap-2">
        <Spinner size="sm" tone="muted" />
        <span className="font-medium">Checking now</span>
        <span className="text-muted-foreground">
          {run.answers.length} of {run.total} asked
        </span>
        <span
          className="h-1 w-32 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={done}
        >
          <span className="block h-full rounded-full bg-primary" style={{ width: `${done}%` }} />
        </span>
        <Button variant="ghost" size="xs" disabled={!canRun} onClick={onStop}>
          Stop
        </Button>
      </span>
    );
  }
  if (run.status === "stopped" || run.status === "interrupted")
    return (
      <span className="flex flex-1 items-center gap-2">
        <AlertTriangle className="size-4 text-warning" />
        <span className="font-medium">The check on {dayLabel(run.day)} stopped early</span>
        <span className="text-muted-foreground">
          {answered} of {run.total} answered, results saved
        </span>
        <Button variant="outline" size="xs" disabled={!canRun} onClick={onRun}>
          Run again
        </Button>
      </span>
    );
  const allAnswered = answered === run.total;
  return (
    <span className="flex flex-1 items-center gap-2">
      {allAnswered ? (
        <CheckCircle2 className="size-4 text-success" />
      ) : (
        <AlertTriangle className="size-4 text-warning" />
      )}
      <span className="font-medium">
        {answered === 0 && run.total > 0
          ? "The last check got no answers"
          : `Checked ${lastAt ? when(lastAt) : dayLabel(run.day)}`}
      </span>
      <span className="text-muted-foreground">
        {answered} of {run.total} answered
        {run.answers.length < run.total ? `, ${run.total - run.answers.length} not asked` : ""} ·
        checks run daily at {time}
      </span>
    </span>
  );
}

function SyncLine({ sync }: { sync: TrackingSync | undefined }) {
  if (!sync) return null;
  if (sync.state === "synced" && sync.lastSyncedAt)
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-success" />
        Synced to AmICited {when(sync.lastSyncedAt)}
      </span>
    );
  if (sync.state === "pending")
    return (
      <span className="text-xs text-muted-foreground">
        Syncing {plural(sync.pending, "answer")} to AmICited…
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Minus className="size-3.5" />
      Not synced: {sync.message}
    </span>
  );
}

/** The latest run's unanswered checks, one row per engine and cause. */
function failureRows(run: TrackingRun, canRun: boolean, onRun: () => void) {
  const groups = new Map<
    string,
    { engine: TrackingEngine; status: string; count: number; reason?: string | undefined }
  >();
  for (const a of run.answers) {
    if (a.status === "answered") continue;
    const key = a.status === "budget_exhausted" ? a.status : `${a.engine}|${a.status}`;
    const group = groups.get(key) ?? { engine: a.engine, status: a.status, count: 0 };
    group.count += 1;
    group.reason ??= a.reason;
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, g]) => {
    const copy = failureCopy(g.status, g.engine, g.reason, { count: g.count });
    return (
      <AttentionRow
        key={key}
        title={copy.title}
        detail={copy.detail}
        action={
          copy.action && (
            <Button
              variant="outline"
              size="xs"
              disabled={copy.action.kind === "run" && !canRun}
              onClick={
                copy.action.kind === "run" ? onRun : () => marketingNavigate("/marketing-settings")
              }
            >
              {copy.action.label}
            </Button>
          )
        }
      />
    );
  });
}

export function AttentionRow({
  title,
  detail,
  action,
  tone = "warning",
}: {
  title: string;
  detail: string;
  action?: ReactNode;
  tone?: "warning" | "info";
}) {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-2 text-sm last:border-b-0">
      {tone === "warning" ? (
        <AlertTriangle className="size-4 shrink-0 text-warning" />
      ) : (
        <Info className="size-4 shrink-0 text-info" />
      )}
      <p className="min-w-0 flex-1">
        <span className="font-medium">{title}</span>{" "}
        <span className="text-muted-foreground">{detail}</span>
      </p>
      {action}
    </div>
  );
}

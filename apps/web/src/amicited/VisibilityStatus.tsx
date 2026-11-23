import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Minus } from "lucide-react";
import type { TrackingRun, TrackingSync } from "@amicited/cloud-client/tracking";
import { marketingNavigate } from "@amicited/ui-marketing";
import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { engineLabel } from "./trackingPresentation";
import { dayLabel, plural } from "./visibilityFormat";

const upgradeUrl = "https://app.flowhunt.io/amicited/subscription";
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const today = () => new Date().toLocaleDateString("en-CA");
const when = (iso: string) =>
  `${iso.slice(0, 10) === today() ? "today" : dayLabel(iso.slice(0, 10))} at ${clock(iso)}`;

/** Run state on the left, sync on the right, and one row per thing the user can fix. */
export function VisibilityStatus({
  run,
  sync,
  time,
  canRun,
  onRun,
  onStop,
}: {
  run: TrackingRun | undefined;
  sync: TrackingSync | undefined;
  time: string;
  canRun: boolean;
  onRun: () => void;
  onStop: () => void;
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
        <RunLine run={run} time={time} canRun={canRun} onRun={onRun} onStop={onStop} />
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
}: {
  run: TrackingRun | undefined;
  time: string;
  canRun: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
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
    { engine: string; status: string; count: number; reason?: string | undefined }
  >();
  for (const a of run.answers) {
    if (a.status === "answered") continue;
    const key = a.status === "budget_exhausted" ? a.status : `${a.engine}|${a.status}`;
    const group = groups.get(key) ?? { engine: a.engine, status: a.status, count: 0 };
    group.count += 1;
    group.reason ??= a.reason;
    groups.set(key, group);
  }
  const runAgain = (
    <Button variant="outline" size="xs" disabled={!canRun} onClick={onRun}>
      Run again
    </Button>
  );
  return [...groups.entries()].map(([key, g]) => {
    const label = engineLabel(g.engine);
    if (g.status === "needs_sign_in")
      return (
        <AttentionRow
          key={key}
          title={`${label} needs your sign-in.`}
          detail={`${plural(g.count, "check")} waited for it. Sign in again in Connections.`}
          action={
            <Button
              variant="outline"
              size="xs"
              onClick={() => marketingNavigate("/marketing-settings")}
            >
              Connect
            </Button>
          }
        />
      );
    if (g.status === "budget_exhausted")
      return (
        <AttentionRow
          key={key}
          title="Today's free prompts are used."
          detail={`The remaining ${plural(g.count, "check")} run tomorrow.`}
        />
      );
    return (
      <AttentionRow
        key={key}
        title={
          g.status === "blocked"
            ? `${label} blocked ${plural(g.count, "check")}.`
            : `${plural(g.count, "check")} could not run on ${label}.`
        }
        detail={g.reason ?? "Running the check again usually fixes it."}
        action={runAgain}
      />
    );
  });
}

function AttentionRow({
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

import {
  compareIssues,
  issuePrompt,
  type Issue,
  type IssueAudit,
  type IssuesSnapshot,
} from "@amicited/cloud-client/issues";
import { ProjectId, type EnvironmentId, type ScopedThreadRef } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { isThreadWorking } from "@t3tools/client-runtime/state/thread-inbox";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { AsyncResult, Atom } from "effect/reactivity";
import * as Option from "effect/Option";
import { MarketingIcon, marketingStarters } from "@amicited/ui-marketing";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock,
  Ellipsis,
  Globe,
  Kanban,
  List,
  ListChecks,
  Loader,
  Plug,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import ChatMarkdown from "./components/ChatMarkdown";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "./components/ui/menu";
import { SidebarMenuButton } from "./components/ui/sidebar";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
import { toastManager } from "./components/ui/toast";
import { Toggle, ToggleGroup } from "./components/ui/toggle-group";
import { connectionAtomRuntime } from "./connection/runtime";
import { isElectron } from "./env";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useNewThreadHandler } from "./hooks/useHandleNewThread";
import { cn } from "./lib/utils";
import {
  DomainConnection,
  NewDomainDialog,
  useDomainConnection,
  useDomainLinks,
  useDomains,
} from "./marketingDomains";
import { usePrimaryEnvironmentId } from "./state/environments";
import { useThreadShells } from "./state/entities";
import { useAtomCommand } from "./state/use-atom-command";

const issuesStream = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  tag: "amicited.issues.subscribe",
  label: "issues:subscribe",
  idleTtlMs: 0,
});
const updateCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.issues.update",
  label: "issues:update",
});
const configureCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.issues.configureAudit",
  label: "issues:configure-audit",
});
const runAuditCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.issues.runAudit",
  label: "issues:run-audit",
});

const emptySnapshot: IssuesSnapshot = { issues: [], audits: [] };
const noIssues = Atom.make(AsyncResult.success(emptySnapshot));

function useIssues(environmentId: EnvironmentId | null | undefined) {
  const value = useAtomValue(
    environmentId ? issuesStream({ environmentId, input: undefined }) : noIssues,
  );
  return Option.getOrElse(AsyncResult.value(value), () => emptySnapshot);
}

/** Working and review come from the linked thread, so a stale stored status can never lie. */
type IssueStage = "todo" | "working" | "review" | "done" | "dismissed";
function issueStage(issue: Issue, thread: EnvironmentThreadShell | undefined): IssueStage {
  if (issue.status !== "open") return issue.status;
  if (!issue.threadId || !thread) return "todo";
  if (thread.hasPendingApprovals || thread.hasPendingUserInput || isThreadWorking(thread))
    return "working";
  return thread.latestRun ? "review" : "working";
}

function useThreadsById() {
  const threads = useThreadShells();
  return new Map(threads.map((thread) => [thread.id as string, thread]));
}

function openThreadRoute(environmentId: EnvironmentId, threadId: string) {
  return {
    to: "/$environmentId/$threadId" as const,
    params: { environmentId, threadId },
  };
}

function useIssueActions(environmentId: EnvironmentId | null) {
  const newThread = useNewThreadHandler();
  const navigate = useNavigate();
  const update = useAtomCommand(updateCommand);
  const threads = useThreadsById();
  const setStatus = async (issue: Issue, status: Issue["status"]) => {
    if (!environmentId) return;
    const result = await update({ environmentId, input: { id: issue.id, status } });
    if (result._tag !== "Success")
      toastManager.add({ type: "error", title: "Could not update this issue. Please try again." });
  };
  const start = async (issue: Issue) => {
    if (!environmentId) return;
    if (issue.threadId && threads.has(issue.threadId)) {
      await navigate(openThreadRoute(environmentId, issue.threadId));
      return;
    }
    const draft = await newThread(scopeProjectRef(environmentId, ProjectId.make(issue.projectId)), {
      prompt: issuePrompt(issue),
      sendImmediately: true,
    });
    if (!draft) {
      toastManager.add({ type: "error", title: "Could not open a thread for this issue." });
      return;
    }
    await update({ environmentId, input: { id: issue.id, threadId: draft.threadId } });
  };
  return { start, setStatus, threads };
}

function priorityBadge(issue: Issue): ReactNode {
  if (issue.kind === "connect") return <Badge variant="info">Connect next</Badge>;
  if (issue.priority === "high") return <Badge variant="error">High</Badge>;
  if (issue.priority === "medium") return <Badge variant="warning">Medium</Badge>;
  return <Badge variant="secondary">Low</Badge>;
}

const stageLabel: Record<IssueStage, string> = {
  todo: "To do",
  working: "In progress",
  review: "Ready for review",
  done: "Done",
  dismissed: "Dismissed",
};

const effortLabel = { small: "about 10 min", medium: "about 30 min", large: "an hour or more" };

const priorityLabel = { high: "High", medium: "Medium", low: "Low" };

const barHeights = ["h-1", "h-1.5", "h-2.5"];

function PriorityBars({ priority }: { priority: Issue["priority"] }) {
  const lit = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  const tone =
    priority === "high"
      ? "bg-destructive-foreground"
      : priority === "medium"
        ? "bg-warning-foreground"
        : "bg-muted-foreground";
  return (
    <span aria-hidden="true" className="inline-flex h-2.5 shrink-0 items-end gap-0.5">
      {barHeights.map((height, index) => (
        <span
          key={height}
          className={cn("w-0.75 rounded-xs", height, index < lit ? tone : "bg-foreground/15")}
        />
      ))}
    </span>
  );
}

function StageIcon({ stage }: { stage: IssueStage }) {
  if (stage === "review")
    return <CircleCheck className="size-4 shrink-0 text-success-foreground" aria-hidden="true" />;
  if (stage === "working")
    return <Loader className="size-4 shrink-0 text-info-foreground" aria-hidden="true" />;
  if (stage === "done")
    return <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  if (stage === "dismissed")
    return <X className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  return <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

function issueProgress(issue: Issue, stage: IssueStage): string | null {
  if (stage === "working") return "agent working";
  if (stage === "review") return "agent finished";
  if (stage === "done") return issue.resolution === "audit" ? "verified by the audit" : "done";
  if (stage === "dismissed") return "dismissed";
  return issue.effort ? effortLabel[issue.effort] : null;
}

function IssueMeta({
  issue,
  details,
}: {
  issue: Issue;
  details: ReadonlyArray<string | null | undefined>;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {issue.kind === "connect" ? (
        <Plug className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <PriorityBars priority={issue.priority} />
      )}
      <span className="truncate">
        <span className="text-foreground/85">
          {issue.kind === "connect" ? "Connection" : priorityLabel[issue.priority]}
        </span>
        {details
          .filter(Boolean)
          .map((detail) => ` · ${detail}`)
          .join("")}
      </span>
    </span>
  );
}

function primaryLabel(issue: Issue, stage: IssueStage, long: boolean): string | null {
  if (stage === "todo") return issue.kind === "connect" ? "Connect" : long ? "Start fix" : "Start";
  if (stage === "working") return "Open thread";
  if (stage === "review") return long ? "Review changes" : "Review";
  return null;
}

type StagedIssue = { issue: Issue; stage: IssueStage };

/** `embedded` sits under its own row, which already shows the title and the main action. */
function IssueDetail({
  issue,
  stage,
  hostname,
  embedded,
  actions,
}: StagedIssue & {
  hostname?: string | undefined;
  embedded?: boolean;
  actions: ReturnType<typeof useIssueActions>;
}) {
  const day = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" });
  const primary = primaryLabel(issue, stage, true);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {embedded ? null : (
        <header className="flex flex-col gap-2.5">
          <p className="text-xs text-muted-foreground">
            {[
              issue.report,
              hostname,
              `First seen ${day(issue.firstSeenAt)}`,
              `Last seen ${day(issue.lastSeenAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{issue.title}</h2>
          <div className="flex flex-wrap gap-1.5">
            {priorityBadge(issue)}
            {issue.effort ? <Badge variant="secondary">{effortLabel[issue.effort]}</Badge> : null}
            <Badge variant="outline">{stageLabel[stage]}</Badge>
          </div>
        </header>
      )}
      <div className="text-sm">
        <ChatMarkdown text={issue.body} cwd={undefined} />
      </div>
      {issue.status === "open" ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          {!embedded && primary ? (
            <Button onClick={() => void actions.start(issue)}>{primary}</Button>
          ) : null}
          <Button variant="outline" onClick={() => void actions.setStatus(issue, "done")}>
            Mark as done
          </Button>
          <span className="flex-1" />
          <Button variant="ghost-muted" onClick={() => void actions.setStatus(issue, "dismissed")}>
            Dismiss
          </Button>
        </div>
      ) : embedded ? null : (
        <div className="flex border-t pt-4">
          <Button variant="outline" onClick={() => void actions.setStatus(issue, "open")}>
            {issue.status === "done" ? "Reopen" : "Restore"}
          </Button>
        </div>
      )}
    </div>
  );
}

function IssueRow({
  issue,
  stage,
  rank,
  hostname,
  selected,
  split,
  onSelect,
  actions,
}: StagedIssue & {
  rank?: number | undefined;
  hostname?: string | undefined;
  selected: boolean;
  /** In the split layout the detail pane carries the actions, so the row stays compact. */
  split: boolean;
  onSelect: () => void;
  actions: ReturnType<typeof useIssueActions>;
}) {
  const primary = primaryLabel(issue, stage, false);
  return (
    <li className={cn("border-b last:border-b-0", split && selected && "bg-accent")}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={split ? undefined : selected}
          aria-current={split && selected ? "true" : undefined}
          onClick={onSelect}
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-xs text-muted-foreground tabular-nums">
            {rank ?? <StageIcon stage={stage} />}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={cn("text-sm font-medium", split ? "line-clamp-2" : "truncate")}>
              {issue.title}
            </span>
            <IssueMeta
              issue={issue}
              details={[issue.report, hostname, issueProgress(issue, stage)]}
            />
          </span>
        </button>
        {split ? null : primary ? (
          <Button
            size="sm"
            variant={stage === "review" ? "default" : "outline"}
            onClick={() => void actions.start(issue)}
          >
            {primary}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => void actions.setStatus(issue, "open")}>
            {issue.status === "done" ? "Reopen" : "Restore"}
          </Button>
        )}
      </div>
      {!split && selected ? (
        <div className="pr-3 pb-3 pl-11">
          <IssueDetail issue={issue} stage={stage} embedded actions={actions} />
        </div>
      ) : null}
    </li>
  );
}

// The task's own status only covers dispatch; the agent's turn runs in the audit thread.
function auditRunning(audit: IssueAudit, threads: ReadonlyMap<string, EnvironmentThreadShell>) {
  const thread = audit.threadId ? threads.get(audit.threadId) : undefined;
  return audit.lastRunStatus === "running" || (thread !== undefined && isThreadWorking(thread));
}

function auditSummary(audit: IssueAudit): string {
  const when = audit.lastRunAt
    ? `last ran ${new Date(audit.lastRunAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
    : "has not run yet";
  return audit.enabled
    ? `Daily audit at ${audit.timeOfDay} · ${when}`
    : `Daily audit is off · ${when}`;
}

function AuditSettingsDialog({
  audit,
  environmentId,
  hostname,
  open,
  onOpenChange,
}: {
  audit: IssueAudit;
  environmentId: EnvironmentId;
  hostname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const configure = useAtomCommand(configureCommand);
  const [enabled, setEnabled] = useState(audit.enabled);
  const [timeOfDay, setTimeOfDay] = useState(audit.timeOfDay);
  const [instructions, setInstructions] = useState(audit.instructions);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const result = await configure({
      environmentId,
      input: { projectId: audit.projectId, enabled, timeOfDay, instructions },
    });
    setSaving(false);
    if (result._tag === "Success") onOpenChange(false);
    else toastManager.add({ type: "error", title: "Could not save the daily audit." });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Daily audit · {hostname}</DialogTitle>
          <DialogDescription>
            An agent reads every AmICited report and keeps your issues up to date. A run missed
            while the computer was off happens as soon as the app is open again.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-4">
            <label className="flex items-center justify-between gap-4 text-sm">
              Run the audit every day
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                aria-label="Run the audit every day"
              />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">
              Time
              <Input
                nativeInput
                size="sm"
                type="time"
                value={timeOfDay}
                onChange={(event) => setTimeOfDay(event.target.value)}
                className="w-28"
              />
            </label>
            {isElectron ? <OpenAtLoginRow /> : null}
            <label className="flex flex-col gap-1.5 text-sm">
              Extra instructions
              <Textarea
                value={instructions}
                placeholder="For example: focus on product pages, ignore the /careers section."
                onChange={(event) => setInstructions(event.target.value)}
              />
            </label>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !timeOfDay} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function OpenAtLoginRow() {
  const bridge = window.desktopBridge;
  const [value, setValue] = useState<boolean | null>(() => bridge?.getOpenAtLogin?.() ?? null);
  if (value === null) return null;
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span>
        Open AmICited when the computer starts
        <span className="block text-xs text-muted-foreground">
          So a missed audit runs right away.
        </span>
      </span>
      <Switch
        checked={value}
        aria-label="Open AmICited when the computer starts"
        onCheckedChange={(next) => {
          setValue(next);
          void bridge?.setOpenAtLogin?.(next).then(setValue);
        }}
      />
    </label>
  );
}

function DomainAuditSetup({
  environmentId,
  domain,
  audit,
}: {
  environmentId: EnvironmentId;
  domain: { projectId: string; hostname: string; brand: string; connectionRef: string };
  audit: IssueAudit | undefined;
}) {
  const { connection } = useDomainConnection(environmentId, domain.projectId);
  const configure = useAtomCommand(configureCommand);
  const connected = connection?.state === "connected";
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">See what to fix on {domain.hostname}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {connected
          ? "The daily audit is off for this domain. Turn it on and an agent reads every AmICited report each morning and lists what to fix, most important first."
          : "Connect AmICited once. Every morning an agent reads all your AmICited reports and turns each problem into an issue. Reports you have not connected yet come first."}
      </p>
      <div className="mt-3">
        {connected ? (
          <Button
            onClick={() =>
              void configure({
                environmentId,
                input: { projectId: domain.projectId, enabled: true },
              }).then((result) => {
                if (result._tag !== "Success")
                  toastManager.add({ type: "error", title: "Could not turn on the daily audit." });
              })
            }
          >
            {audit ? "Turn on daily audit" : "Start the daily audit"}
          </Button>
        ) : (
          <DomainConnection domain={domain} destination={environmentId} />
        )}
      </div>
    </section>
  );
}

function AuditBar({
  environmentId,
  audit,
  hostname,
  showHost,
  running,
}: {
  environmentId: EnvironmentId;
  audit: IssueAudit;
  hostname: string;
  showHost: boolean;
  running: boolean;
}) {
  const navigate = useNavigate();
  const run = useAtomCommand(runAuditCommand);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const threadId = audit.threadId;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted py-1.5 pr-1.5 pl-3 text-sm">
      {running ? (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-info ring-3 ring-info/25"
        />
      ) : (
        <Clock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <p role={running ? "status" : undefined} className="min-w-0 flex-1">
        {showHost ? <span className="font-medium">{hostname} · </span> : null}
        {running ? (
          <>
            <span className="font-medium">Audit running.</span>{" "}
            <span className="text-muted-foreground">Issues appear here as they are found.</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {auditSummary(audit)}
            {audit.lastRunStatus === "failed" && audit.lastRunError
              ? ` · ${audit.lastRunError}`
              : ""}
          </span>
        )}
      </p>
      {running ? (
        threadId ? (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void navigate(openThreadRoute(environmentId, threadId))}
          >
            Watch the audit
          </Button>
        ) : null
      ) : (
        <Button
          size="xs"
          variant="ghost"
          onClick={() =>
            void run({ environmentId, input: { projectId: audit.projectId } }).then((result) => {
              if (result._tag !== "Success")
                toastManager.add({ type: "error", title: "Could not start the audit." });
            })
          }
        >
          Run audit now
        </Button>
      )}
      <Menu>
        <MenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label="Audit options" />}>
          <Ellipsis />
        </MenuTrigger>
        <MenuPopup align="end">
          {threadId && !running ? (
            <MenuItem onClick={() => void navigate(openThreadRoute(environmentId, threadId))}>
              Audit thread
            </MenuItem>
          ) : null}
          <MenuItem onClick={() => setSettingsOpen(true)}>Settings</MenuItem>
        </MenuPopup>
      </Menu>
      {settingsOpen ? (
        <AuditSettingsDialog
          audit={audit}
          environmentId={environmentId}
          hostname={hostname}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      ) : null}
    </div>
  );
}

const listStages = ["review", "working", "todo"] as const;
const boardColumns = ["todo", "working", "review", "done"] as const;
const emptyLane: Record<(typeof boardColumns)[number], string> = {
  todo: "Nothing to do. The next audit checks again.",
  working: "Issues you start move here while an agent works on them.",
  review: "Finished work waits here until you check it.",
  done: "Fixed issues land here.",
};
const doneLanePreview = 4;

export function IssuesPage() {
  const environmentId = usePrimaryEnvironmentId();
  const domains = useDomains(environmentId);
  const snapshot = useIssues(environmentId);
  const actions = useIssueActions(environmentId);
  const links = useDomainLinks(
    environmentId,
    domains.rows.map((domain) => domain.projectId),
  );
  const wide = useMediaQuery("xl");
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [newDomainOpen, setNewDomainOpen] = useState(false);
  if (!environmentId) return <p role="status">Connecting…</p>;
  if (domains.loaded && domains.rows.length === 0)
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2">
        <NewDomainDialog open={newDomainOpen} onOpenChange={setNewDomainOpen} />
        <h1 className="text-xl font-semibold">Issues</h1>
        <p className="text-sm text-muted-foreground">
          Add your website as a domain first. Then connect AmICited to get a daily list of what to
          fix.
        </p>
        <Button className="mt-3" onClick={() => setNewDomainOpen(true)}>
          New domain
        </Button>
      </div>
    );
  const shown = domains.rows.filter(
    (row) => domainFilter === null || row.projectId === domainFilter,
  );
  const hostnames = new Map(domains.rows.map((row) => [row.projectId, row.hostname]));
  const auditFor = new Map(snapshot.audits.map((audit) => [audit.projectId, audit]));
  // Issues come from AmICited reports, so a domain without a connection shows only the way in.
  const linked = shown.filter((domain) => links.get(domain.projectId) === "linked");
  const staged: ReadonlyArray<StagedIssue> = snapshot.issues
    .filter((issue) => linked.some((domain) => domain.projectId === issue.projectId))
    .toSorted(compareIssues)
    .map((issue) => ({
      issue,
      stage: issueStage(issue, issue.threadId ? actions.threads.get(issue.threadId) : undefined),
    }));
  const groups = listStages
    .map((stage) => ({ stage, rows: staged.filter((row) => row.stage === stage) }))
    .filter((group) => group.rows.length > 0);
  const closed = staged.filter(({ stage }) => stage === "done" || stage === "dismissed");
  const needsSetup = shown.filter((domain) => {
    const link = links.get(domain.projectId);
    return link === "locked" || (link === "linked" && !auditFor.get(domain.projectId)?.enabled);
  });
  const audited = linked.flatMap((row) => {
    const audit = auditFor.get(row.projectId);
    return audit
      ? [{ audit, hostname: row.hostname, running: auditRunning(audit, actions.threads) }]
      : [];
  });
  const showHost = domainFilter === null && domains.rows.length > 1;
  const hostOf = (issue: Issue) => (showHost ? hostnames.get(issue.projectId) : undefined);
  const anyRunning = audited.some(({ running }) => running);
  // A wide window always shows one issue in full, so the page never opens onto empty space.
  const picked =
    staged.find(({ issue }) => issue.id === selectedId) ?? (wide ? groups[0]?.rows[0] : undefined);
  const detail = view === "list" && wide ? picked : undefined;
  const split = detail !== undefined;
  const row = ({ issue, stage }: StagedIssue, rank?: number) => (
    <IssueRow
      key={issue.id}
      issue={issue}
      stage={stage}
      rank={rank}
      hostname={hostOf(issue)}
      selected={picked?.issue.id === issue.id}
      split={split}
      onSelect={() => setSelectedId(!split && selectedId === issue.id ? null : issue.id)}
      actions={actions}
    />
  );
  const list = (
    <div className="flex min-w-0 flex-col gap-4">
      {groups.map(({ stage, rows }) => (
        <section key={stage} aria-label={stageLabel[stage]} className="flex flex-col gap-1.5">
          <h2 className="px-0.5 text-xs font-semibold text-muted-foreground">
            {stageLabel[stage]} <span className="font-normal">{rows.length}</span>
          </h2>
          <ol className="overflow-hidden rounded-lg border bg-card">
            {rows.map((entry, index) => row(entry, stage === "todo" ? index + 1 : undefined))}
          </ol>
        </section>
      ))}
      {groups.length === 0 && audited.length > 0 && !anyRunning ? (
        <p className="text-sm text-muted-foreground">
          No open issues. The next audit checks again.
        </p>
      ) : null}
      {closed.length > 0 ? (
        <div>
          <Button size="xs" variant="ghost-muted" onClick={() => setClosedOpen(!closedOpen)}>
            {closedOpen ? <ChevronDown /> : <ChevronRight />}
            Done {closed.filter(({ stage }) => stage === "done").length} · Dismissed{" "}
            {closed.filter(({ stage }) => stage === "dismissed").length}
          </Button>
          {closedOpen ? (
            <ul
              aria-label="Closed issues"
              className="mt-2 overflow-hidden rounded-lg border bg-card"
            >
              {closed.map((entry) => row(entry))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-4",
        view === "board" ? "max-w-screen-2xl" : split ? "max-w-7xl" : "max-w-4xl",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Issues</h1>
        <span className="flex-1" />
        {domains.rows.length > 1 ? (
          <Menu>
            <MenuTrigger render={<Button size="sm" variant="outline" aria-label="Domain" />}>
              <Globe />
              {domainFilter === null ? "All domains" : hostnames.get(domainFilter)}
              <ChevronDown />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuRadioGroup
                value={domainFilter ?? ""}
                onValueChange={(value) => setDomainFilter(value === "" ? null : String(value))}
              >
                <MenuRadioItem value="" closeOnClick>
                  All domains
                </MenuRadioItem>
                {domains.rows.map((domain) => (
                  <MenuRadioItem key={domain.projectId} value={domain.projectId} closeOnClick>
                    {domain.hostname}
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </MenuPopup>
          </Menu>
        ) : null}
        {linked.length > 0 ? (
          <ToggleGroup
            aria-label="View"
            value={[view]}
            onValueChange={(values) => {
              if (values[0] === "list" || values[0] === "board") setView(values[0]);
            }}
          >
            <Toggle value="list" aria-label="List" title="List">
              <List />
            </Toggle>
            <Toggle value="board" aria-label="Board" title="Board">
              <Kanban />
            </Toggle>
          </ToggleGroup>
        ) : null}
      </div>
      {audited.map(({ audit, hostname, running }) => (
        <AuditBar
          key={audit.projectId}
          running={running}
          environmentId={environmentId}
          audit={audit}
          hostname={hostname}
          showHost={shown.length > 1}
        />
      ))}
      {needsSetup.map((domain) => (
        <DomainAuditSetup
          key={domain.projectId}
          environmentId={environmentId}
          domain={domain}
          audit={auditFor.get(domain.projectId)}
        />
      ))}
      {linked.length === 0 ? null : view === "board" ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2 xl:grid-cols-4">
          {boardColumns.map((column) => {
            const cards = staged.filter(({ stage }) => stage === column);
            const ordered =
              column === "done"
                ? cards.toSorted((a, b) =>
                    (b.issue.resolvedAt ?? "").localeCompare(a.issue.resolvedAt ?? ""),
                  )
                : cards;
            const visible =
              column === "done" && !doneOpen ? ordered.slice(0, doneLanePreview) : ordered;
            return (
              <section
                key={column}
                aria-label={stageLabel[column]}
                className="flex min-w-0 flex-col gap-2"
              >
                <h2 className="flex items-center gap-1.5 px-0.5 text-sm font-semibold">
                  <StageIcon stage={column} />
                  {stageLabel[column]}
                  <span className="font-normal text-muted-foreground">{cards.length}</span>
                </h2>
                {cards.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                    {emptyLane[column]}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {visible.map(({ issue, stage }) => (
                      <BoardCard
                        key={issue.id}
                        issue={issue}
                        stage={stage}
                        hostname={hostOf(issue)}
                        actions={actions}
                      />
                    ))}
                  </ul>
                )}
                {visible.length < ordered.length ? (
                  <div>
                    <Button size="xs" variant="ghost-muted" onClick={() => setDoneOpen(true)}>
                      Show {ordered.length - visible.length} more
                    </Button>
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : detail ? (
        <div className="grid grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-start gap-6">
          {list}
          <section
            aria-label="Issue details"
            className="sticky top-4 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl border bg-card p-6"
          >
            <IssueDetail
              key={detail.issue.id}
              issue={detail.issue}
              stage={detail.stage}
              hostname={hostOf(detail.issue)}
              actions={actions}
            />
          </section>
        </div>
      ) : (
        list
      )}
    </div>
  );
}

function BoardCard({
  issue,
  stage,
  hostname,
  actions,
}: StagedIssue & {
  hostname?: string | undefined;
  actions: ReturnType<typeof useIssueActions>;
}) {
  const primary = primaryLabel(issue, stage, false);
  return (
    <li
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border p-3.5",
        stage === "done" ? "text-muted-foreground" : "bg-card",
      )}
    >
      <span className="text-sm font-medium">{issue.title}</span>
      <IssueMeta issue={issue} details={[issue.report, hostname]} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground first-letter:uppercase">
          {issueProgress(issue, stage)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {stage === "review" ? (
            <Button
              size="xs"
              variant="ghost-muted"
              onClick={() => void actions.setStatus(issue, "done")}
            >
              Mark as done
            </Button>
          ) : null}
          {primary ? (
            <Button
              size="xs"
              variant={stage === "review" ? "default" : "outline"}
              onClick={() => void actions.start(issue)}
            >
              {primary}
            </Button>
          ) : (
            <Button
              size="xs"
              variant="ghost-muted"
              onClick={() => void actions.setStatus(issue, "open")}
            >
              Reopen
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Sits above the chat list so issues are the first destination. */
export function IssuesSidebarRow({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  const environmentId = usePrimaryEnvironmentId();
  const snapshot = useIssues(environmentId);
  const domains = useDomains(environmentId);
  const links = useDomainLinks(
    environmentId,
    domains.rows.map((domain) => domain.projectId),
  );
  const linked = (projectId: string) => links.get(projectId) === "linked";
  const open = snapshot.issues.filter(
    (issue) => issue.status === "open" && linked(issue.projectId),
  ).length;
  const audited = snapshot.audits.some((audit) => audit.enabled && linked(audit.projectId));
  const known = [...links.values()].every((link) => link !== "unknown");
  return (
    <div className="px-2 pb-1">
      <SidebarMenuButton
        isActive={active}
        render={<a href="/issues" />}
        onClick={(event) => {
          event.preventDefault();
          onOpen();
        }}
      >
        <ListChecks />
        <span className="flex-1">Issues</span>
        {open > 0 ? (
          <Badge variant="default">{open}</Badge>
        ) : known && !audited ? (
          <span className="text-xs text-muted-foreground">Connect</span>
        ) : null}
      </SidebarMenuButton>
    </div>
  );
}

const landingHeading =
  "flex h-5 items-center gap-2 px-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground";
const landingRow = "flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5";

function priorityDot(issue: Issue) {
  if (issue.kind === "connect") return { label: "Connect next", color: "bg-info" };
  if (issue.priority === "high") return { label: "High priority", color: "bg-destructive" };
  if (issue.priority === "medium") return { label: "Medium priority", color: "bg-warning" };
  return { label: "Low priority", color: "bg-muted-foreground/50" };
}

/** Under a new chat's composer: this domain's top open issues beside prompts that start new work. */
export function MarketingLanding({
  environmentId,
  projectId,
  onStarter,
}: {
  environmentId: EnvironmentId | null | undefined;
  projectId: ProjectId | null | undefined;
  onStarter: (prompt: string) => void;
}) {
  const snapshot = useIssues(environmentId);
  const actions = useIssueActions(environmentId ?? null);
  const navigate = useNavigate();
  const links = useDomainLinks(environmentId, projectId ? [projectId] : []);
  const linked = projectId ? links.get(projectId) === "linked" : false;
  const open = snapshot.issues
    .filter(
      (issue) =>
        linked &&
        issue.projectId === projectId &&
        issue.status === "open" &&
        issueStage(issue, issue.threadId ? actions.threads.get(issue.threadId) : undefined) ===
          "todo",
    )
    .toSorted(compareIssues);
  return (
    <div className="grid gap-x-5 gap-y-4 pt-3 pb-1 text-left @lg/composer-surface:auto-cols-fr @lg/composer-surface:grid-flow-col">
      {open.length > 0 ? (
        <section aria-label="Fix what’s holding you back" className="flex min-w-0 flex-col gap-1">
          <div className={landingHeading}>
            <span>Fix what’s holding you back</span>
            <Badge variant="secondary" size="sm">
              {open.length}
            </Badge>
          </div>
          <ol className="flex flex-col">
            {open.slice(0, 3).map((issue, index) => {
              const dot = priorityDot(issue);
              return (
                <li key={issue.id} className={landingRow}>
                  <span
                    role="img"
                    aria-label={dot.label}
                    className={cn("mx-0.5 size-1.5 shrink-0 rounded-full", dot.color)}
                  />
                  <span className="line-clamp-3 min-w-0 flex-1 text-sm font-medium text-foreground">
                    {issue.title}
                  </span>
                  <Button
                    size="xs"
                    variant={index === 0 ? "default" : "outline"}
                    onClick={() => void actions.start(issue)}
                  >
                    {issue.kind === "connect" ? "Connect" : "Start fix"}
                  </Button>
                </li>
              );
            })}
          </ol>
          <div>
            <Button size="xs" variant="ghost" onClick={() => void navigate({ to: "/issues" })}>
              All {open.length} issues
              <ArrowRight />
            </Button>
          </div>
        </section>
      ) : null}
      <section aria-label="Start something new" className="flex min-w-0 flex-col gap-1">
        <div className={landingHeading}>Start something new</div>
        <ul className={cn("grid", open.length === 0 && "gap-x-5 @lg/composer-surface:grid-cols-2")}>
          {marketingStarters.map((starter) => (
            <li key={starter.prompt}>
              <button
                type="button"
                className={cn(
                  landingRow,
                  "w-full cursor-pointer text-left text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                )}
                onClick={() => onStarter(starter.prompt)}
              >
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground [&_svg]:size-3.5"
                >
                  <MarketingIcon name={starter.icon} />
                </span>
                {starter.prompt}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Shown in a thread that works on an issue, so the way back and the way out are one click. */
export function MarketingIssueStrip({ threadRef }: { threadRef: ScopedThreadRef | null }) {
  const snapshot = useIssues(threadRef?.environmentId);
  const actions = useIssueActions(threadRef?.environmentId ?? null);
  const navigate = useNavigate();
  const issue = snapshot.issues.find((row) => row.threadId === threadRef?.threadId);
  const links = useDomainLinks(threadRef?.environmentId, issue ? [issue.projectId] : []);
  if (!issue || !threadRef || links.get(issue.projectId) !== "linked") return null;
  const stage = issueStage(issue, actions.threads.get(issue.threadId!));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
      <ListChecks className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        Issue: <span className="font-medium">{issue.title}</span>
      </span>
      <Badge variant="outline">{stageLabel[stage]}</Badge>
      {issue.status === "open" ? (
        <>
          <Button size="xs" variant="outline" onClick={() => void actions.setStatus(issue, "done")}>
            Mark as done
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void actions.setStatus(issue, "dismissed")}
          >
            Dismiss
          </Button>
        </>
      ) : (
        <Button size="xs" variant="ghost" onClick={() => void actions.setStatus(issue, "open")}>
          Reopen
        </Button>
      )}
      <Button size="xs" variant="ghost" onClick={() => void navigate({ to: "/issues" })}>
        All issues
      </Button>
    </div>
  );
}

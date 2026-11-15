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
import { ChevronDown, ChevronRight, Clock, ListChecks } from "lucide-react";
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
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./components/ui/menu";
import { SidebarMenuButton } from "./components/ui/sidebar";
import { Switch } from "./components/ui/switch";
import { Textarea } from "./components/ui/textarea";
import { toastManager } from "./components/ui/toast";
import { connectionAtomRuntime } from "./connection/runtime";
import { isElectron } from "./env";
import { useNewThreadHandler } from "./hooks/useHandleNewThread";
import {
  DomainConnection,
  NewDomainDialog,
  useDomainConnection,
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

function IssueRow({
  issue,
  stage,
  index,
  hostname,
  actions,
}: {
  issue: Issue;
  stage: IssueStage;
  index?: number | undefined;
  hostname?: string | undefined;
  actions: ReturnType<typeof useIssueActions>;
}) {
  const [open, setOpen] = useState(false);
  const meta = [
    issue.report,
    hostname,
    stage === "working"
      ? "agent working in its thread"
      : stage === "review"
        ? "agent finished, check the changes"
        : issue.resolution === "audit"
          ? "verified by the daily audit"
          : issue.effort
            ? effortLabel[issue.effort]
            : null,
  ].filter(Boolean);
  const primary =
    stage === "todo" ? (
      <Button size="sm" onClick={() => void actions.start(issue)}>
        {issue.kind === "connect" ? "Connect" : "Start"}
      </Button>
    ) : stage === "working" || stage === "review" ? (
      <Button size="sm" variant="outline" onClick={() => void actions.start(issue)}>
        {stage === "review" ? "Review" : "Open thread"}
      </Button>
    ) : null;
  return (
    <li className="border-b last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {index !== undefined ? (
          <span className="w-5 text-right text-xs text-muted-foreground tabular-nums">{index}</span>
        ) : null}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{issue.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{meta.join(" · ")}</span>
          </span>
        </button>
        {stage === "todo" ? (
          priorityBadge(issue)
        ) : (
          <Badge variant="outline">{stageLabel[stage]}</Badge>
        )}
        {primary}
        <Menu>
          <MenuTrigger render={<Button size="icon-xs" variant="ghost" aria-label="More actions" />}>
            ⋯
          </MenuTrigger>
          <MenuPopup align="end">
            {issue.status === "open" ? (
              <>
                <MenuItem onClick={() => void actions.setStatus(issue, "done")}>
                  Mark as done
                </MenuItem>
                <MenuItem onClick={() => void actions.setStatus(issue, "dismissed")}>
                  Dismiss
                </MenuItem>
              </>
            ) : (
              <MenuItem onClick={() => void actions.setStatus(issue, "open")}>
                {issue.status === "done" ? "Reopen" : "Restore"}
              </MenuItem>
            )}
          </MenuPopup>
        </Menu>
      </div>
      {open ? (
        <div className="px-11 pb-3 text-sm">
          <ChatMarkdown text={issue.body} cwd={undefined} />
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

function auditSummary(audit: IssueAudit, running: boolean): string {
  if (running) return "Audit running now";
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

function AuditStatus({
  environmentId,
  audit,
  hostname,
  running,
}: {
  environmentId: EnvironmentId;
  audit: IssueAudit;
  hostname: string;
  running: boolean;
}) {
  const navigate = useNavigate();
  const run = useAtomCommand(runAuditCommand);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Clock className="size-3.5" />
      <span>
        {hostname} · {auditSummary(audit, running)}
        {audit.lastRunStatus === "failed" && audit.lastRunError ? ` · ${audit.lastRunError}` : ""}
      </span>
      {audit.threadId ? (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => void navigate(openThreadRoute(environmentId, audit.threadId!))}
        >
          {running ? "Watch the audit" : "Audit thread"}
        </Button>
      ) : null}
      <Button
        size="xs"
        variant="ghost"
        disabled={running}
        onClick={() =>
          void run({ environmentId, input: { projectId: audit.projectId } }).then((result) => {
            if (result._tag !== "Success")
              toastManager.add({ type: "error", title: "Could not start the audit." });
          })
        }
      >
        Run audit now
      </Button>
      <Button size="xs" variant="ghost" onClick={() => setSettingsOpen(true)}>
        Settings
      </Button>
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

const boardColumns: ReadonlyArray<IssueStage> = ["todo", "working", "review", "done"];

export function IssuesPage() {
  const environmentId = usePrimaryEnvironmentId();
  const domains = useDomains(environmentId);
  const snapshot = useIssues(environmentId);
  const actions = useIssueActions(environmentId);
  const [domainFilter, setDomainFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const [closedOpen, setClosedOpen] = useState(false);
  const [newDomainOpen, setNewDomainOpen] = useState(false);
  if (!environmentId) return <p role="status">Connecting…</p>;
  if (domains.loaded && domains.rows.length === 0)
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 p-6">
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
  const issues = snapshot.issues
    .filter((issue) => shown.some((row) => row.projectId === issue.projectId))
    .toSorted(compareIssues);
  const staged = issues.map((issue) => ({
    issue,
    stage: issueStage(issue, issue.threadId ? actions.threads.get(issue.threadId) : undefined),
  }));
  const active = staged.filter(({ stage }) => stage !== "done" && stage !== "dismissed");
  const closed = staged.filter(({ stage }) => stage === "done" || stage === "dismissed");
  const needsSetup = shown.filter((row) => !auditFor.get(row.projectId)?.enabled);
  const audited = shown.flatMap((row) => {
    const audit = auditFor.get(row.projectId);
    return audit
      ? [{ audit, hostname: row.hostname, running: auditRunning(audit, actions.threads) }]
      : [];
  });
  const showHost = domainFilter === null && domains.rows.length > 1;
  const anyRunning = audited.some(({ running }) => running);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Issues</h1>
        <p className="text-sm text-muted-foreground">
          What to fix on your websites, most important first. Found by the daily audit across all
          AmICited reports.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {domains.rows.length > 1 ? (
          <div role="group" aria-label="Domain" className="flex flex-wrap gap-1">
            <Button
              size="xs"
              variant={domainFilter === null ? "secondary" : "ghost"}
              onClick={() => setDomainFilter(null)}
            >
              All domains
            </Button>
            {domains.rows.map((row) => (
              <Button
                key={row.projectId}
                size="xs"
                variant={domainFilter === row.projectId ? "secondary" : "ghost"}
                onClick={() => setDomainFilter(row.projectId)}
              >
                {row.hostname}
              </Button>
            ))}
          </div>
        ) : null}
        <span className="flex-1" />
        <div role="group" aria-label="View" className="flex gap-1">
          <Button
            size="xs"
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
          >
            List
          </Button>
          <Button
            size="xs"
            variant={view === "board" ? "secondary" : "ghost"}
            onClick={() => setView("board")}
          >
            Board
          </Button>
        </div>
      </div>
      {audited.map(({ audit, hostname, running }) => (
        <AuditStatus
          key={audit.projectId}
          running={running}
          environmentId={environmentId}
          audit={audit}
          hostname={hostname}
        />
      ))}
      {anyRunning ? (
        <p role="status" className="rounded-lg border bg-card p-3 text-sm">
          The audit is checking your reports. Issues appear here as they are found.
        </p>
      ) : null}
      {needsSetup.map((row) => (
        <DomainAuditSetup
          key={row.projectId}
          environmentId={environmentId}
          domain={row}
          audit={auditFor.get(row.projectId)}
        />
      ))}
      {view === "list" ? (
        <>
          {active.length > 0 ? (
            <ol aria-label="Open issues" className="rounded-lg border bg-card">
              {active.map(({ issue, stage }, index) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  stage={stage}
                  index={index + 1}
                  hostname={showHost ? hostnames.get(issue.projectId) : undefined}
                  actions={actions}
                />
              ))}
            </ol>
          ) : audited.length > 0 && !anyRunning ? (
            <p className="text-sm text-muted-foreground">
              No open issues. The next audit checks again.
            </p>
          ) : null}
          {closed.length > 0 ? (
            <div>
              <Button size="xs" variant="ghost" onClick={() => setClosedOpen(!closedOpen)}>
                {closedOpen ? <ChevronDown /> : <ChevronRight />}
                Done ({closed.filter(({ stage }) => stage === "done").length}) · Dismissed (
                {closed.filter(({ stage }) => stage === "dismissed").length})
              </Button>
              {closedOpen ? (
                <ul aria-label="Closed issues" className="mt-2 rounded-lg border bg-card">
                  {closed.map(({ issue, stage }) => (
                    <IssueRow
                      key={issue.id}
                      issue={issue}
                      stage={stage}
                      hostname={showHost ? hostnames.get(issue.projectId) : undefined}
                      actions={actions}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {boardColumns.map((column) => {
            const cards = staged.filter(({ stage }) => stage === column);
            return (
              <section
                key={column}
                aria-label={stageLabel[column]}
                className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-2"
              >
                <h2 className="px-1 text-xs font-semibold text-muted-foreground">
                  {stageLabel[column]} · {cards.length}
                </h2>
                <ul className="flex flex-col gap-2">
                  {cards.map(({ issue, stage }) => (
                    <BoardCard
                      key={issue.id}
                      issue={issue}
                      stage={stage}
                      hostname={showHost ? hostnames.get(issue.projectId) : undefined}
                      actions={actions}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BoardCard({
  issue,
  stage,
  hostname,
  actions,
}: {
  issue: Issue;
  stage: IssueStage;
  hostname?: string | undefined;
  actions: ReturnType<typeof useIssueActions>;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-md border bg-background p-2.5">
      <span className="text-sm font-medium">{issue.title}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {stage === "done" ? (
          <Badge variant="success">{issue.resolution === "audit" ? "Verified" : "Done"}</Badge>
        ) : (
          priorityBadge(issue)
        )}
        {[issue.report, hostname].filter(Boolean).join(" · ")}
      </span>
      {stage === "todo" || stage === "working" || stage === "review" ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="xs"
            variant={stage === "todo" ? "default" : "outline"}
            onClick={() => void actions.start(issue)}
          >
            {stage === "todo"
              ? issue.kind === "connect"
                ? "Connect"
                : "Start"
              : stage === "review"
                ? "Review"
                : "Open thread"}
          </Button>
          {stage === "review" ? (
            <Button size="xs" variant="ghost" onClick={() => void actions.setStatus(issue, "done")}>
              Mark as done
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Sits above the chat list so issues are the first destination. */
export function IssuesSidebarRow({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  const environmentId = usePrimaryEnvironmentId();
  const snapshot = useIssues(environmentId);
  const open = snapshot.issues.filter((issue) => issue.status === "open").length;
  const audited = snapshot.audits.some((audit) => audit.enabled);
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
        ) : !audited ? (
          <span className="text-xs text-muted-foreground">Connect</span>
        ) : null}
      </SidebarMenuButton>
    </div>
  );
}

/** The most important open issue for this domain, offered under a new chat's composer. */
export function MarketingNextFix({
  environmentId,
  projectId,
}: {
  environmentId: EnvironmentId | null | undefined;
  projectId: ProjectId | null | undefined;
}) {
  const snapshot = useIssues(environmentId);
  const actions = useIssueActions(environmentId ?? null);
  const navigate = useNavigate();
  const [skipped, setSkipped] = useState<string | null>(null);
  const open = snapshot.issues
    .filter(
      (issue) =>
        issue.projectId === projectId &&
        issue.status === "open" &&
        issue.id !== skipped &&
        issueStage(issue, issue.threadId ? actions.threads.get(issue.threadId) : undefined) ===
          "todo",
    )
    .toSorted(compareIssues);
  const next = open[0];
  if (!next) return null;
  return (
    <section
      aria-label="Next fix"
      className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-left"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-wide">Next fix</span>
        {priorityBadge(next)}
        <span className="flex-1" />
        <Button size="xs" variant="ghost" onClick={() => void navigate({ to: "/issues" })}>
          All {open.length + (skipped ? 1 : 0)} issues
        </Button>
      </div>
      <span className="text-sm font-semibold text-foreground">{next.title}</span>
      <span className="text-xs text-muted-foreground">{next.report}</span>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void actions.start(next)}>
          {next.kind === "connect" ? "Connect" : "Start fix"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setSkipped(next.id)}>
          Skip for now
        </Button>
      </div>
    </section>
  );
}

/** Shown in a thread that works on an issue, so the way back and the way out are one click. */
export function MarketingIssueStrip({ threadRef }: { threadRef: ScopedThreadRef | null }) {
  const snapshot = useIssues(threadRef?.environmentId);
  const actions = useIssueActions(threadRef?.environmentId ?? null);
  const navigate = useNavigate();
  const issue = snapshot.issues.find((row) => row.threadId === threadRef?.threadId);
  if (!issue || !threadRef) return null;
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

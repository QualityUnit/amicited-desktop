import { RadioGroup, Radio } from "../components/ui/radio-group";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../components/ui/menu";
import { usePersistedThreadRun } from "./threadTracking";
import { FirstCheckReport } from "./FirstCheckReport";
import { engineLabel } from "./trackingPresentation";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { useThreadShell } from "../state/entities";
import { useDomains } from "../marketingDomains";
import { newMessageId, newThreadId } from "../lib/utils";
/* oxlint-disable shadcn/no-unknown-classes -- AmICited owns these marketing styles. */
import { useId, useState, useEffect, useEffectEvent } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Option from "effect/Option";
import {
  createEnvironmentRpcSubscriptionAtomFamily,
  createEnvironmentRpcCommand,
} from "@t3tools/client-runtime/state/runtime";
import {
  availableEngines,
  type TrackingSnapshot,
  type TrackingConfig,
  type SaveTrackingResult,
  type TrackingSync,
} from "@amicited/cloud-client/tracking";
import { useConnections } from "./amicitedConnections";
import type { Domain } from "@amicited/cloud-client/domains";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useAmicitedAccount } from "./amicitedAccount";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { MarketingLink } from "@amicited/ui-marketing";
import { Checkbox } from "../components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/ui/table";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "../components/ui/select";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toastManager } from "../components/ui/toast";
const emptySnapshot: TrackingSnapshot = {
  country: "ZZ",
  configs: [],
  runs: [],
  usage: { consumed: 0, used: 0, limit: 20, domains: [] },
};
const empty = Atom.make(AsyncResult.success(emptySnapshot));
const denied = Atom.make(false);
const subscription = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  tag: "amicited.tracking.subscribe",
  label: "tracking",
  idleTtlMs: 0,
});
const detailCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tracking.detail",
  label: "tracking:detail",
});
const saveCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tracking.save",
  label: "tracking:save",
});
const runCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tracking.run",
  label: "tracking:run",
});
const suggestCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tracking.suggest",
  label: "tracking:suggest",
});
/** @public Slice 4 uses the same commands for onboarding and first-check progress. */
export function useTracking(destination?: EnvironmentId) {
  const primary = usePrimaryEnvironmentId();
  const environmentId = destination ?? primary;
  const result = useAtomValue(
    environmentId ? subscription({ environmentId, input: undefined }) : empty,
  );
  const snapshot = Option.getOrElse(AsyncResult.value(result), () => emptySnapshot);
  const save = useAtomCommand(saveCommand),
    run = useAtomCommand(runCommand),
    suggest = useAtomCommand(suggestCommand);
  const canSave = useAtomValue(environmentId ? saveCommand.permissionAtom(environmentId) : denied);
  const canRun = useAtomValue(environmentId ? runCommand.permissionAtom(environmentId) : denied);
  return {
    snapshot,
    loaded: Option.isSome(AsyncResult.value(result)),
    environmentId,
    canSave,
    canRun,
    save,
    run,
    suggest,
  };
}
export function LockPill() {
  return (
    <a href="https://app.flowhunt.io/amicited/subscription" target="_blank" rel="noreferrer">
      <span>🔒 AmICited</span> · Start 7-day trial
    </a>
  );
}
/** Whether this domain's answers reached its AmICited workspace. */
export function SyncStatus({ sync }: { sync: TrackingSync | undefined }) {
  if (!sync) return null;
  const overLimit = sync.overLimit ?? 0;
  const otherSkipped = overLimit ? 0 : sync.skipped;
  return (
    <>
      <p className="am-muted">
        {sync.state === "synced" && sync.lastSyncedAt
          ? `Synced to AmICited ${new Date(sync.lastSyncedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
          : sync.message}
        {otherSkipped ? ` · ${otherSkipped} answers not accepted by AmICited` : ""}
      </p>
      {overLimit > 0 && (
        <p>
          {overLimit === 1 ? "1 prompt isn't" : `${overLimit} prompts aren't`} in your AmICited
          dashboard: your plan's prompt limit is reached. They still run here.{" "}
          <a href="https://app.flowhunt.io/amicited/subscription" target="_blank" rel="noreferrer">
            Upgrade plan
          </a>
        </p>
      )}
    </>
  );
}
/** @public Onboarding can render the editor directly. */
export function TrackingPrompts({
  domain,
  destination,
}: {
  domain: Domain;
  destination: EnvironmentId;
}) {
  const state = useTracking(destination);
  const { account } = useAmicitedAccount();
  const connections = useConnections(destination);
  const saved = state.snapshot.configs.find((c) => c.projectId === domain.projectId);
  const [draft, setDraft] = useState<TrackingConfig | null>(null);
  const config = draft ??
    saved ?? {
      projectId: domain.projectId,
      country: state.snapshot.country,
      time: "09:00",
      engines: availableEngines(connections.snapshot.connections),
      prompts: [],
    };
  const [text, setText] = useState("");
  const [limit, setLimit] = useState<Extract<
    SaveTrackingResult,
    { status: "limit_reached" }
  > | null>(null);
  const [replace, setReplace] = useState("");
  const [replacementScope, setReplacementScope] = useState("here");
  const [adding, setAdding] = useState(false);
  const promptId = useId();
  const [answer, setAnswer] = useState<
    import("@amicited/cloud-client/tracking").TrackingAnswer | null
  >(null);
  const latest = state.snapshot.runs.find((r) => r.projectId === domain.projectId);
  const running = latest?.status === "running";
  const run = useRunDetail(destination, latest);
  const persist = async (next: TrackingConfig, replacement?: string) => {
    if (!state.environmentId) return;
    const r = await state.save({
      environmentId: state.environmentId,
      input: { config: next, ...(replacement ? { replacePromptId: replacement } : {}) },
    });
    if (r._tag === "Failure") {
      toastManager.add({ type: "error", title: "Could not save prompts. Please try again." });
      return;
    }
    if (r.value.status === "limit_reached") {
      setLimit(r.value);
      return;
    }
    setDraft(null);
    setLimit(null);
    setText("");
    setAdding(false);
  };
  const paid = account?.workspaces.find((w) => w.id === domain.workspaceId)?.access === "full";
  const add = () =>
    persist(
      {
        ...config,
        prompts: [
          ...config.prompts,
          {
            id: newMessageId(),
            text: text.trim(),
            enabled: true,
            created: new Date().toISOString(),
          },
        ],
      },
      replace || undefined,
    );
  return (
    <div className="am-page">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1>Prompts and answers · {domain.hostname}</h1>
          <p className="am-muted">
            Named in {run?.answers.filter((a) => a.mentioned).length ?? 0} of {run?.answered ?? 0}{" "}
            answers today (
            {run?.visibility == null ? "unavailable" : `${Math.round(run.visibility)}%`}) · checked
            daily at {config.time}
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>Add prompt</Button>
      </header>
      <SyncStatus sync={state.snapshot.sync?.find((s) => s.projectId === domain.projectId)} />
      <p className="am-muted">
        {state.snapshot.usage.consumed ?? 0} of 20 free prompts used today{" "}
        <BudgetBar used={state.snapshot.usage.consumed ?? 0} />{" "}
        {state.snapshot.usage.domains.map((d) => `${d.hostname}: ${d.count}`).join(" · ")} · one
        limit for this computer
      </p>
      <div className="am-prompt-controls">
        <Menu>
          <MenuTrigger render={<Button variant="outline" size="sm" />}>
            Asked from {countryName(config.country)} ⌄
          </MenuTrigger>
          <MenuPopup>
            <MenuItem>{countryName(config.country)} (this computer)</MenuItem>
            <MenuItem
              onClick={() =>
                window.open(
                  "https://app.flowhunt.io/amicited/subscription",
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Other countries · 🔒 AmICited
            </MenuItem>
          </MenuPopup>
        </Menu>
        <Label>
          Checked daily at
          <Input
            type="time"
            value={config.time}
            onChange={(e) => setDraft({ ...config, time: e.target.value })}
          />
        </Label>
      </div>
      <p className="am-muted">
        These prompts are checked on this computer, signed in as you.
        {paid && (
          <>
            {" "}
            Prompts AmICited checks in the cloud are in{" "}
            <a href="https://app.flowhunt.io/amicited" target="_blank" rel="noreferrer">
              AmICited
            </a>
            .
          </>
        )}
      </p>
      <div className="am-prompt-list">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prompt</TableHead>
              {config.engines.map((engine) => (
                <TableHead key={engine}>{engineLabel(engine)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {config.prompts.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      aria-label={`Track ${p.text}`}
                      checked={p.enabled}
                      onCheckedChange={(enabled) =>
                        setDraft({
                          ...config,
                          prompts: config.prompts.map((row) =>
                            row.id === p.id ? { ...row, enabled } : row,
                          ),
                        })
                      }
                    />
                    <span>{p.text}</span>
                  </label>
                </TableCell>
                {config.engines.map((engine) => {
                  const a = run?.answers.find(
                    (answer) => answer.promptId === p.id && answer.engine === engine,
                  );
                  return (
                    <TableCell key={engine}>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!a}
                        onClick={() => a && setAnswer(a)}
                      >
                        {a?.status === "needs_sign_in"
                          ? "Signed out"
                          : a?.status === "blocked"
                            ? "Blocked"
                            : a?.status === "failed"
                              ? "Could not check"
                              : a?.mentioned
                                ? a.position
                                  ? `#${a.position}`
                                  : "Named"
                                : "–"}
                      </Button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {draft && (
        <Button disabled={!state.canSave} onClick={() => void persist(config)}>
          Save changes
        </Button>
      )}
      <Button
        variant="outline"
        disabled={!state.canRun || !saved || running}
        onClick={() =>
          state.environmentId &&
          void state.run({
            environmentId: state.environmentId,
            input: { projectId: domain.projectId },
          })
        }
      >
        {running ? "Checking…" : "Run now"}
      </Button>
      <p className="am-muted">
        Other countries, Grok, Meta Muse and DeepSeek, more than 20 prompts, and days this computer
        is off run in the cloud. <LockPill />
      </p>
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          setAdding(open);
          if (!open) setLimit(null);
        }}
      >
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Add a prompt</DialogTitle>
            <DialogDescription>
              A question your buyers ask AI. It is checked every day for {domain.hostname}.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid gap-1.5">
              <Label htmlFor={promptId}>Prompt</Label>
              <Input id={promptId} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <h3>Today's free prompts</h3>
            <p>
              {state.snapshot.usage.used} of 20 used <BudgetBar used={state.snapshot.usage.used} />
            </p>
            {limit && (
              <>
                <h3>Make room for it</h3>
                <RadioGroup
                  value={replacementScope}
                  onValueChange={(scope) => {
                    if (scope === "here" || scope === "other") {
                      setReplacementScope(scope);
                      setReplace("");
                    }
                  }}
                >
                  <label className="am-limit-choice">
                    <Radio value="here" />
                    <span>
                      Replace a {domain.hostname} prompt
                      <small>You choose which question stops.</small>
                    </span>
                  </label>
                  <label className="am-limit-choice">
                    <Radio
                      value="other"
                      disabled={
                        !state.snapshot.configs.some(
                          (c) =>
                            c.projectId !== domain.projectId && c.prompts.some((p) => p.enabled),
                        )
                      }
                    />
                    <span>
                      Take one from another website
                      <small>One shared limit across your workspaces and websites.</small>
                    </span>
                  </label>
                </RadioGroup>
                <Select value={replace} onValueChange={(value) => setReplace(value ?? "")}>
                  <SelectTrigger aria-label="Choose a prompt to stop">
                    <SelectValue placeholder="Choose a prompt to stop">
                      {state.snapshot.configs
                        .flatMap((c) => c.prompts)
                        .find((p) => p.id === replace)?.text ?? "Choose a prompt to stop"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {state.snapshot.configs
                      .filter((c) =>
                        replacementScope === "here"
                          ? c.projectId === domain.projectId
                          : c.projectId !== domain.projectId,
                      )
                      .flatMap((c) =>
                        c.prompts
                          .filter((p) => p.enabled)
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {
                                state.snapshot.usage.domains.find(
                                  (d) => d.projectId === c.projectId,
                                )?.hostname
                              }{" "}
                              · {p.text}
                            </SelectItem>
                          )),
                      )}
                  </SelectPopup>
                </Select>
                <p>
                  Keep all prompts <LockPill />
                </p>
              </>
            )}
            <p className="am-muted">
              One limit for this computer, across all your workspaces and websites. 20 a day keeps
              your own AI accounts working normally.
            </p>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              disabled={!text.trim() || !state.canSave || Boolean(limit && !replace)}
              onClick={() => void add()}
            >
              {limit ? "Replace and add" : "Add prompt"}
            </Button>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
      <Dialog open={answer !== null} onOpenChange={(open) => !open && setAnswer(null)}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{answer ? engineLabel(answer.engine) : "Answer"}</DialogTitle>
            <DialogDescription>{answer?.prompt}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <p>{answer?.excerpt || answer?.reason || "No answer was collected."}</p>
            {answer?.citations.map((url) => (
              <p key={url}>
                <a href={url} target="_blank" rel="noreferrer">
                  {url}
                </a>
              </p>
            ))}
            {answer?.status === "needs_sign_in" && (
              <MarketingLink href="/marketing-settings">Sign in again in Connections</MarketingLink>
            )}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </div>
  );
}

function TrackingChatCard({
  domain,
  destination,
  threadId,
  run,
}: {
  domain: Domain;
  destination: EnvironmentId;
  threadId: string;
  run: import("@amicited/cloud-client/tracking").TrackingRun;
}) {
  const state = useTracking(destination);
  const newThread = useNewThreadHandler();

  return (
    <FirstCheckReport
      domain={domain}
      run={run}
      canRun={state.canRun}
      engineIds={
        state.snapshot.configs.find((c) => c.projectId === domain.projectId)?.engines ?? []
      }
      onRetry={() => {
        void state.run({
          environmentId: destination,
          input: { projectId: domain.projectId, threadId },
        });
      }}
      onStop={() => {
        void state.run({
          environmentId: destination,
          input: { projectId: domain.projectId, stop: true },
        });
      }}
      onFix={(prompt) => {
        void newThread(scopeProjectRef(destination, ProjectId.make(domain.projectId)), {
          prompt,
          sendImmediately: true,
        });
      }}
    />
  );
}

export function TrackingThreadCard({
  threadRef,
  run,
}: {
  threadRef: import("@t3tools/contracts").ScopedThreadRef | null;
  run: import("@amicited/cloud-client/tracking").TrackingRun | null;
}) {
  const thread = useThreadShell(threadRef);
  const domains = useDomains(threadRef?.environmentId);
  const domain = domains.rows.find((row) => row.projectId === thread?.projectId);
  return threadRef && domain && run ? (
    <TrackingChatCard
      domain={domain}
      destination={threadRef.environmentId}
      threadId={threadRef.threadId}
      run={run}
    />
  ) : null;
}

export function useFirstCheckChat() {
  const environmentId = usePrimaryEnvironmentId();
  const create = useOrchestrationCommand(threadEnvironment.create);
  const run = useAtomCommand(runCommand);
  return async (
    projectId: string,
    modelSelection: import("@t3tools/contracts").ModelSelection,
    config?: TrackingConfig,
  ) => {
    if (!environmentId) return null;
    const threadId = newThreadId();
    const result = await create({
      environmentId,
      input: {
        threadId,
        projectId: ProjectId.make(projectId),
        title: "First AI visibility check",
        modelSelection,
        runtimeMode: "approval-required",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdAt: new Date().toISOString(),
      },
    });
    if (result._tag !== "Success") return null;
    if (config) {
      const started = await run({ environmentId, input: { projectId, threadId } });
      if (started._tag !== "Success") return null;
    }
    return threadId;
  };
}

export function BudgetBar({ used }: { used: number }) {
  return (
    <span
      className="am-budget"
      role="progressbar"
      aria-label="Free prompts"
      aria-valuemin={0}
      aria-valuemax={20}
      aria-valuenow={used}
    >
      <span style={{ width: `${Math.min(100, used * 5)}%` }} />
    </span>
  );
}

function useRunDetail(
  destination: EnvironmentId,
  summary: import("@amicited/cloud-client/tracking").TrackingRun | undefined,
) {
  const read = useEffectEvent(useAtomCommand(detailCommand));
  const [detail, setDetail] = useState<
    import("@amicited/cloud-client/tracking").TrackingRun | null
  >(null);
  const id = summary?.id,
    count = summary?.answered ?? summary?.answers.length,
    status = summary?.status;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Persisted answer excerpts are fetched when the run advances or is restored.
  useEffect(() => {
    if (!id || count === undefined || !status) return;
    let active = true;
    void read({ environmentId: destination, input: { runId: id } }).then((r) => {
      if (active && r._tag === "Success") setDetail(r.value);
    });
    return () => {
      active = false;
    };
  }, [destination, id, count, status]);
  return detail &&
    detail.id === id &&
    detail?.status === status &&
    detail.answers.filter((answer) => answer.status === "answered").length === count
    ? { ...detail, answered: count, visibility: summary?.visibility ?? null }
    : summary;
}
function countryName(country: string) {
  return country === "ZZ"
    ? "Location unavailable"
    : (new Intl.DisplayNames([navigator.language], { type: "region" }).of(country) ??
        "Location unavailable");
}

export function useThreadTrackingRun(
  threadRef: import("@t3tools/contracts").ScopedThreadRef | null,
) {
  const tracking = useTracking(threadRef?.environmentId);
  const milestones = tracking.snapshot.runs
    .map((run) => `${run.id}:${run.status}:${run.answered ?? run.answers.length}`)
    .join(";");
  return usePersistedThreadRun(threadRef, milestones);
}

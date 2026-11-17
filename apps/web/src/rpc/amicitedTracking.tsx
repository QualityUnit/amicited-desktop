import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { useThreadShell } from "../state/entities";
import { useDomains } from "../marketingDomains";
import { newMessageId, newThreadId } from "../lib/utils";
/* oxlint-disable shadcn/no-unknown-classes -- AmICited owns these marketing styles. */
import { useState, useEffect, useEffectEvent } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Option from "effect/Option";
import {
  createEnvironmentRpcSubscriptionAtomFamily,
  createEnvironmentRpcCommand,
} from "@t3tools/client-runtime/state/runtime";
import type {
  TrackingSnapshot,
  TrackingConfig,
  SaveTrackingResult,
} from "@amicited/cloud-client/tracking";
import type { Domain } from "@amicited/cloud-client/domains";
import { TrackingEngine } from "@amicited/cloud-client/tracking";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useAmicitedAccount } from "./amicitedAccount";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toastManager } from "../components/ui/toast";
const emptySnapshot: TrackingSnapshot = {
  country: "ZZ",
  configs: [],
  runs: [],
  usage: { used: 0, limit: 20, domains: [] },
};
const empty = Atom.make(AsyncResult.success(emptySnapshot));
const denied = Atom.make(false);
const subscription = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  tag: "amicited.tracking.subscribe",
  label: "tracking",
  idleTtlMs: 0,
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
  return { snapshot, environmentId, canSave, canRun, save, run, suggest };
}
function LockPill() {
  return (
    <a href="https://app.flowhunt.io/amicited/subscription" target="_blank" rel="noreferrer">
      <span>🔒 AmICited</span> · Start 7-day trial
    </a>
  );
}
export function TrackingVisibility({
  domain,
  destination,
  compact = false,
}: {
  domain: Domain;
  destination: EnvironmentId;
  compact?: boolean;
}) {
  const state = useTracking(destination);
  const newThread = useNewThreadHandler();
  const run = state.snapshot.runs.find(
    (r) => r.projectId === domain.projectId && r.status !== "missed",
  );
  const answers = run?.answers.filter((a) => a.status === "answered") ?? [];
  const named = answers.filter((a) => a.mentioned).length;

  const { account } = useAmicitedAccount();
  const paid = account?.workspaces.find((w) => w.id === domain.workspaceId)?.access === "full";
  const percent = answers.length ? `${Math.round((named / answers.length) * 100)}%` : "–";
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() =>
          window.location.assign(`/prompts?site=${encodeURIComponent(domain.projectId)}`)
        }
      >
        {compact
          ? percent
          : paid
            ? "AmICited tracks this domain in the cloud"
            : `AI visibility today · ${percent} · named in ${named} of ${answers.length} answers`}
      </Button>
      {!compact && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void newThread(scopeProjectRef(destination, ProjectId.make(domain.projectId)), {
              prompt: `Explain these AI visibility results for ${domain.hostname} and suggest what to fix.\n${JSON.stringify(run ?? {})}`,
              sendImmediately: true,
            })
          }
        >
          Ask about this
        </Button>
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
  const saved = state.snapshot.configs.find((c) => c.projectId === domain.projectId);
  const [draft, setDraft] = useState<TrackingConfig | null>(null);
  const config = draft ??
    saved ?? {
      projectId: domain.projectId,
      country: state.snapshot.country,
      time: "09:00",
      engines: [],
      prompts: [],
    };
  const [text, setText] = useState("");
  const [limit, setLimit] = useState<Extract<
    SaveTrackingResult,
    { status: "limit_reached" }
  > | null>(null);
  const [replace, setReplace] = useState("");
  const run = state.snapshot.runs.find((r) => r.projectId === domain.projectId);
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
  };
  if (account?.workspaces.find((w) => w.id === domain.workspaceId)?.access === "full")
    return (
      <section className="am-card">
        <h2>AI visibility</h2>
        <p>AmICited tracks this domain in the cloud</p>
        <a href="https://app.flowhunt.io/amicited">Manage prompts in AmICited</a>
      </section>
    );
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
      <h2>{domain.hostname} / AI visibility</h2>
      <p>
        {state.snapshot.usage.used} of 20 free prompts a day · one limit for this computer, across
        all workspaces and websites.
      </p>
      <meter min={0} max={20} value={state.snapshot.usage.used} />
      <p>{state.snapshot.usage.domains.map((d) => `${d.hostname} ${d.count}`).join(" · ")}</p>
      <p>
        Asked from{" "}
        {new Intl.DisplayNames([navigator.language], { type: "region" }).of(config.country) ??
          config.country}{" "}
        (this computer) · Other countries <LockPill />
      </p>
      <label>
        Checked daily at{" "}
        <Input
          type="time"
          value={config.time}
          onChange={(e) => setDraft({ ...config, time: e.target.value })}
        />
      </label>
      <p>
        AI apps{" "}
        {TrackingEngine.literals.map((engine) => (
          <label key={engine}>
            <input
              type="checkbox"
              checked={config.engines.includes(engine)}
              onChange={(e) =>
                setDraft({
                  ...config,
                  engines: e.target.checked
                    ? [...config.engines, engine]
                    : config.engines.filter((x) => x !== engine),
                })
              }
            />
            {engine}{" "}
          </label>
        ))}
      </p>
      <table>
        <thead>
          <tr>
            <th>Prompt</th>
            {config.engines.map((e) => (
              <th key={e}>{e}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.prompts.map((p) => (
            <tr key={p.id}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Enable ${p.text}`}
                  checked={p.enabled}
                  onChange={(e) =>
                    setDraft({
                      ...config,
                      prompts: config.prompts.map((x) =>
                        x.id === p.id ? { ...x, enabled: e.target.checked } : x,
                      ),
                    })
                  }
                />
                <Input
                  value={p.text}
                  onChange={(e) =>
                    setDraft({
                      ...config,
                      prompts: config.prompts.map((x) =>
                        x.id === p.id ? { ...x, text: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  onClick={() =>
                    setDraft({ ...config, prompts: config.prompts.filter((x) => x.id !== p.id) })
                  }
                >
                  Remove
                </Button>
              </td>
              {config.engines.map((e) => {
                const a = run?.answers.find((a) => a.promptId === p.id && a.engine === e);
                return (
                  <td key={e}>
                    <details>
                      <summary>
                        {a?.status === "needs_sign_in"
                          ? "Sign in again"
                          : a?.status === "failed"
                            ? "Could not check"
                            : a?.mentioned
                              ? a.position
                                ? `#${a.position}`
                                : "Named"
                              : "–"}
                      </summary>
                      <p>{a?.excerpt}</p>
                      {a?.citations.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {url}
                        </a>
                      ))}
                      {a?.status === "needs_sign_in" && (
                        <a href="/marketing-settings">Open Connections</a>
                      )}
                    </details>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <Button disabled={!state.canSave} onClick={() => void persist(config)}>
        Save changes
      </Button>
      <Button
        disabled={!state.canRun || !saved}
        onClick={() =>
          state.environmentId &&
          void state.run({
            environmentId: state.environmentId,
            input: { projectId: domain.projectId },
          })
        }
      >
        Run now
      </Button>
      {run && (
        <p>
          {run.status} · {run.answers.length} of {run.total} answers
        </p>
      )}
      {!config.prompts.length && (
        <Button
          disabled={!state.canSave}
          onClick={async () => {
            if (!state.environmentId) return;
            const r = await state.suggest({
              environmentId: state.environmentId,
              input: { projectId: domain.projectId, category: "" },
            });
            if (r._tag === "Success")
              setDraft({
                ...config,
                prompts: r.value.map((text) => ({
                  id: newMessageId(),
                  text,
                  enabled: true,
                  created: new Date().toISOString(),
                })),
              });
          }}
        >
          Suggest 10 prompts
        </Button>
      )}
      <label>
        Add a prompt
        <Input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <Button disabled={!text.trim() || !state.canSave} onClick={() => void add()}>
        Add prompt
      </Button>
      {limit && (
        <section className="am-card">
          <h3>Make room for it</h3>
          <p>
            20 of 20 free prompts used. Replace one here or take one from another website; you
            choose which one stops.
          </p>
          <select value={replace} onChange={(e) => setReplace(e.target.value)}>
            <option value="">Choose a prompt to stop</option>
            {state.snapshot.configs.flatMap((c) =>
              c.prompts
                .filter((p) => p.enabled)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {
                      state.snapshot.usage.domains.find((d) => d.projectId === c.projectId)
                        ?.hostname
                    }{" "}
                    · {p.text}
                  </option>
                )),
            )}
          </select>
          <Button disabled={!replace} onClick={() => void add()}>
            Replace and add
          </Button>
          <p>
            Keep all prompts <LockPill />
          </p>
        </section>
      )}
      <p>
        Other countries, Grok, Meta Muse, DeepSeek, more than 20 prompts, and days this computer is
        off run in the cloud. <LockPill />
      </p>
      {state.snapshot.runs.some(
        (r) => r.projectId === domain.projectId && r.status === "missed",
      ) && (
        <p>
          A day was missed while this computer was off. <LockPill />
        </p>
      )}
    </div>
  );
}

export function SetupTrackingPrompts({
  domain,
  destination,
  engines,
  initialPrompts,
  onComplete,
}: {
  domain: Domain;
  destination: EnvironmentId;
  engines: readonly import("@amicited/cloud-client/tracking").TrackingEngine[];
  initialPrompts: readonly string[];
  onComplete(config: TrackingConfig): Promise<void>;
}) {
  const state = useTracking(destination);
  const saved = state.snapshot.configs.find((c) => c.projectId === domain.projectId);
  const [prompts, setPrompts] = useState<TrackingConfig["prompts"]>(
    () =>
      saved?.prompts ??
      initialPrompts.map((text) => ({
        id: newMessageId(),
        text,
        enabled: true,
        created: new Date().toISOString(),
      })),
  );
  const [time, setTime] = useState(saved?.time ?? "09:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const suggest = useEffectEvent(state.suggest);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Suggestions come from the environment service once on entering setup.
  useEffect(() => {
    if (saved || initialPrompts.length) return;
    let active = true;
    void suggest({
      environmentId: destination,
      input: { projectId: domain.projectId, category: "" },
    }).then((r) => {
      if (active && r._tag === "Success")
        setPrompts(
          r.value.map((text) => ({
            id: newMessageId(),
            text,
            enabled: true,
            created: new Date().toISOString(),
          })),
        );
    });
    return () => {
      active = false;
    };
  }, [destination, domain.projectId, saved, initialPrompts.length]);
  const usedElsewhere =
    state.snapshot.usage.used - (saved?.prompts.filter((p) => p.enabled).length ?? 0);
  const finish = async (run: boolean) => {
    setBusy(true);
    setError("");
    try {
      const config = {
        projectId: domain.projectId,
        country: state.snapshot.country,
        time,
        engines,
        prompts,
      };
      const result = await state.save({ environmentId: destination, input: { config } });
      if (result._tag !== "Success") {
        setError("Could not save prompts. Please try again.");
        setBusy(false);
        return;
      }
      if (result.value.status === "limit_reached") {
        setError(
          "Make room for these prompts. One limit of 20 applies across all workspaces on this computer.",
        );
        setBusy(false);
        return;
      }
      if (run && result.value.status === "saved") {
        const started = await state.run({
          environmentId: destination,
          input: { projectId: domain.projectId },
        });
        if (started._tag !== "Success") {
          setError("Could not start the check. Your prompts are saved; try again.");
          setBusy(false);
          return;
        }
      }
      await onComplete(config);
    } catch {
      setError("Could not finish setup. Your saved prompts are safe; please try again.");
    }
    setBusy(false);
  };
  return (
    <section>
      <p>
        Start with these suggested questions about {domain.hostname}. Edit them or add your own.
      </p>
      <p>
        {usedElsewhere + prompts.filter((p) => p.enabled).length} of 20 free prompts a day · One
        limit for this computer, across workspaces
      </p>
      <meter max={20} value={usedElsewhere + prompts.filter((p) => p.enabled).length} />
      <p>
        Asked from{" "}
        {new Intl.DisplayNames([navigator.language], { type: "region" }).of(state.snapshot.country)}{" "}
        (this computer)
      </p>
      <p>
        Other countries <LockPill />
      </p>
      <label>
        Checked daily at{" "}
        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </label>
      {prompts.map((p) => (
        <div key={p.id} className="flex gap-2">
          <Input
            aria-label="Prompt"
            value={p.text}
            onChange={(e) =>
              setPrompts((rows) =>
                rows.map((row) => (row.id === p.id ? { ...row, text: e.target.value } : row)),
              )
            }
          />
          <Button
            variant="ghost"
            onClick={() => setPrompts((rows) => rows.filter((row) => row.id !== p.id))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        onClick={() =>
          setPrompts((rows) => [
            ...rows,
            { id: newMessageId(), text: "", enabled: true, created: new Date().toISOString() },
          ])
        }
      >
        Add a prompt
      </Button>
      <p>
        Other countries and more than 20 prompts a day run in the cloud. <LockPill />
      </p>
      {error && <p role="alert">{error}</p>}
      <Button
        variant="ghost"
        disabled={busy || !state.canSave || !prompts.length || prompts.some((p) => !p.text.trim())}
        onClick={() => void finish(false)}
      >
        Wait until {time}
      </Button>
      <Button
        disabled={
          busy ||
          !state.canRun ||
          !state.canSave ||
          !engines.length ||
          !prompts.length ||
          prompts.some((p) => !p.text.trim())
        }
        onClick={() => void finish(true)}
      >
        Run first check
      </Button>
    </section>
  );
}

function TrackingChatCard({ domain, destination }: { domain: Domain; destination: EnvironmentId }) {
  const state = useTracking(destination);
  const newThread = useNewThreadHandler();
  const run = state.snapshot.runs.find(
    (r) => r.projectId === domain.projectId && r.status !== "missed",
  );
  if (!run) return null;
  const answers = run.answers.filter((a) => a.status === "answered");
  const named = answers.filter((a) => a.mentioned).length;
  const competitors = [...new Set(answers.flatMap((a) => a.competitorsMentioned))];
  const citations = answers.flatMap((a) => a.citations);
  const sources = [...new Set(citations)]
    .sort(
      (a, b) =>
        citations.filter((url) => url === b).length - citations.filter((url) => url === a).length,
    )
    .slice(0, 5);
  return (
    <section className="am-card" aria-label="First AI visibility check" aria-live="polite">
      <h2>First AI visibility check</h2>
      <p>
        Tasks {run.answers.length}/{run.total} ·{" "}
        {run.status === "complete"
          ? "First check finished"
          : run.status === "running"
            ? "Checking your prompts"
            : "Check interrupted · partial results saved"}
      </p>
      {run.status === "running" && (
        <p>
          I'm asking your prompts in the AI apps you connected, one question at a time. You can
          start another chat meanwhile; your results stay here.
        </p>
      )}
      {run.status === "running" && (
        <Button
          variant="ghost"
          disabled={!state.canRun}
          onClick={() =>
            void state.run({
              environmentId: destination,
              input: { projectId: domain.projectId, stop: true },
            })
          }
        >
          Stop check
        </Button>
      )}
      {[...new Set(run.answers.map((a) => a.engine))].map((engine) => (
        <p key={engine}>
          {engine} · {run.answers.filter((a) => a.engine === engine).length} checked
        </p>
      ))}
      {run.status === "complete" && (
        <>
          <p>
            AI named {domain.brand} in {named} of {answers.length} answers (
            {answers.length ? Math.round((named / answers.length) * 100) : 0}% visibility).
          </p>
          <p>Competitors recommended instead: {competitors.join(", ") || "None identified"}</p>
          <p>Top cited sources</p>
          {sources.map((url) => (
            <p key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            </p>
          ))}
          <p>
            Three things I can do on {domain.hostname}. I'll show you a draft before anything goes
            live.
          </p>
          {[
            `Draft a comparison page for ${domain.brand} and ${competitors.slice(0, 2).join(" and ") || "the alternatives buyers ask about"}`,
            "Add clear product and pricing facts to the homepage",
            `Outline a guide answering: ${answers.find((a) => !a.mentioned)?.prompt ?? answers[0]?.prompt ?? "buyers' common questions"}`,
          ].map((fix) => (
            <Button
              key={fix}
              variant="outline"
              onClick={() =>
                void newThread(scopeProjectRef(destination, ProjectId.make(domain.projectId)), {
                  prompt: `${fix}. Show a draft for approval before publishing. Use these AI visibility results as evidence:\n${JSON.stringify(run)}`,
                  sendImmediately: true,
                })
              }
            >
              {fix}
            </Button>
          ))}
        </>
      )}
      <a href={`/prompts?site=${encodeURIComponent(domain.projectId)}`}>All answers and prompts</a>
      {run.answers.some((a) => a.status === "needs_sign_in") && (
        <a href="/marketing-settings">Sign in again in Connections</a>
      )}
    </section>
  );
}

export function TrackingThreadCard({
  threadRef,
}: {
  threadRef: import("@t3tools/contracts").ScopedThreadRef | null;
}) {
  const thread = useThreadShell(threadRef);
  const tracking = useTracking(threadRef?.environmentId);
  const domains = useDomains(threadRef?.environmentId);
  const domain = domains.rows.find((row) => row.projectId === thread?.projectId);
  return threadRef &&
    domain &&
    tracking.snapshot.configs.some(
      (config) => config.projectId === domain.projectId && config.threadId === threadRef.threadId,
    ) ? (
    <TrackingChatCard domain={domain} destination={threadRef.environmentId} />
  ) : null;
}

export function useFirstCheckChat() {
  const environmentId = usePrimaryEnvironmentId();
  const create = useOrchestrationCommand(threadEnvironment.create);
  const save = useAtomCommand(saveCommand);
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
      const bound = await save({ environmentId, input: { config: { ...config, threadId } } });
      if (bound._tag !== "Success" || bound.value.status !== "saved") return null;
    }
    return threadId;
  };
}

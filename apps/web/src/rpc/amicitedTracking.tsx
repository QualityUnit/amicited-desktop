import { newMessageId } from "../lib/utils";
/* oxlint-disable shadcn/no-unknown-classes -- AmICited owns these marketing styles. */
import { useState } from "react";
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
  const [open, setOpen] = useState(false);
  const { account } = useAmicitedAccount();
  const paid = account?.workspaces.find((w) => w.id === domain.workspaceId)?.access === "full";
  const percent = answers.length ? `${Math.round((named / answers.length) * 100)}%` : "–";
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
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
      {open && (
        <section role="dialog" aria-label="AI visibility" className="am-card">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
          <TrackingPrompts domain={domain} destination={destination} />
        </section>
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

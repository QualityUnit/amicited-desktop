import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";
import * as Atom from "effect/reactivity/Atom";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Option from "effect/Option";
import {
  createEnvironmentRpcSubscriptionAtomFamily,
  createEnvironmentRpcCommand,
} from "@t3tools/client-runtime/state/runtime";
import type {
  TrackingConfig,
  TrackingRun,
  TrackingSnapshot,
} from "@amicited/cloud-client/tracking";
import type { Domain } from "@amicited/cloud-client/domains";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { useThreadShell } from "../state/entities";
import { useDomains } from "../marketingDomains";
import { newThreadId } from "../lib/utils";
import { usePersistedThreadRun } from "./threadTracking";
import { FirstCheckReport } from "./FirstCheckReport";
import { PromptsList } from "./PromptsList";
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
    runCommandNow = useAtomCommand(runCommand),
    suggest = useAtomCommand(suggestCommand);
  const canSave = useAtomValue(environmentId ? saveCommand.permissionAtom(environmentId) : denied);
  const allowedToRun = useAtomValue(
    environmentId ? runCommand.permissionAtom(environmentId) : denied,
  );
  // Starting or stopping waits on the server; the buttons stay off so a click is not repeated.
  const [starting, setStarting] = useState(false);
  const run = (value: Parameters<typeof runCommandNow>[0]) => {
    setStarting(true);
    return runCommandNow(value).finally(() => setStarting(false));
  };
  return {
    snapshot,
    loaded: Option.isSome(AsyncResult.value(result)),
    environmentId,
    canSave,
    allowedToRun,
    canRun: allowedToRun && !starting,
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
/** @public Onboarding can render the prompts list directly. */
export function TrackingPrompts({
  domain,
  destination,
}: {
  domain: Domain;
  destination: EnvironmentId;
}) {
  return <PromptsList domain={domain} domains={[domain]} environmentId={destination} />;
}

/** Changes whenever a run starts, advances or ends, so reads of its results refresh. */
export const runMilestones = (runs: readonly TrackingRun[]) =>
  runs.map((run) => `${run.id}:${run.status}:${run.answered ?? run.answers.length}`).join(";");

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
      className="inline-block h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted align-middle"
      role="progressbar"
      aria-label="Free prompts"
      aria-valuemin={0}
      aria-valuemax={20}
      aria-valuenow={used}
    >
      <span
        className="block h-full rounded-full bg-primary"
        style={{ width: `${Math.min(100, used * 5)}%` }}
      />
    </span>
  );
}

export function countryName(country: string) {
  return country === "ZZ"
    ? "Location unavailable"
    : (new Intl.DisplayNames([navigator.language], { type: "region" }).of(country) ??
        "Location unavailable");
}

export function useThreadTrackingRun(
  threadRef: import("@t3tools/contracts").ScopedThreadRef | null,
) {
  const tracking = useTracking(threadRef?.environmentId);
  return usePersistedThreadRun(threadRef, runMilestones(tracking.snapshot.runs));
}

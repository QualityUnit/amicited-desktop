import { TrackingVisibility } from "./amicited/amicitedTracking";
import { useEnvironmentSettings } from "./hooks/useSettings";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import {
  EnvironmentId as EnvironmentIdValue,
  ProjectId,
  PRIMARY_LOCAL_ENVIRONMENT_ID,
} from "@t3tools/contracts";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./components/ui/tooltip";
import { AssistantSetupDialog } from "./marketingSetup";
import { resolveEffectiveRuntimeMode } from "./components/chat/runtimeModeConfig";
import { useDomains, NewDomainDialog, DomainConnection } from "./marketingDomains";
import { WorkLogRow } from "./components/chat/WorkLog";
import { ComposerPendingApprovalActions } from "./components/chat/ComposerPendingApprovalActions";
import { Shield } from "lucide-react";
import { Globe } from "lucide-react";
import { whatYouAreMissing } from "@amicited/cloud-client/upsell";
import { createMarketingResend } from "./marketingRecovery";
import { useOrchestrationCommand } from "./state/use-orchestration-command";
import { threadEnvironment } from "./state/threads";
import { toastManager } from "./components/ui/toast";
import {
  marketingSubcheckCovered,
  marketingApprovalTool,
  marketingApprovalInput,
} from "./marketingContext";
import { useThreadVisibleTurnItems, useThreadShell } from "./state/entities";
import { CloudPendingApprovals, openCloudSubscription } from "./rpc/amicitedCloud";
import { CloudFooter } from "./rpc/amicitedCloud";
import type { ScopedThreadRef, RunId } from "@t3tools/contracts";
import type { EnvironmentId, OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import { useTurnItemDetail, type TurnItemDetailSource } from "./state/queries";
import {
  turnItemNeedsDetailFetch,
  turnItemDetailRevision,
} from "@t3tools/client-runtime/work-log/item-detail";
import { usePrimaryEnvironmentId, useEnvironmentProviders } from "./state/environments";
import { getOnboardingProviderState } from "./onboarding/providerReadiness.logic";
import { hasReadyMarketingAssistant } from "./marketingContext";
/* oxlint-disable shadcn/no-unknown-classes -- Marketer styles are owned by @amicited/ui-marketing. */
import { useState, useEffect, useEffectEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { isUsefulResult, type ToolResult } from "@amicited/tools-core";
import {
  CompactMarketingResult,
  MarketingResult,
  cloudToolResult,
  cloudRunId,
  CloudToolResultCard,
  marketingToolResult,
  marketingOfferResult,
  MarketingCallState,
  MarketingButton,
  resultTitle,
  resultQuestion,
  useWorkspaceMode,
  BrandFavicon,
} from "@amicited/ui-marketing";
import { MarketingSubscriptions, useMarketingTask } from "./marketing";
import { CloudConnectedChip } from "./rpc/amicitedCloud";
/** The composer's top line on a new chat: ChatComposer fills the site, ChatView the branch. */
export function MarketingComposerHeader({
  siteRef,
  branchRef,
}: {
  siteRef: (element: HTMLDivElement | null) => void;
  branchRef: (element: HTMLDivElement | null) => void;
}) {
  return (
    <div className="am-composer-header">
      <div ref={siteRef} />
      <div ref={branchRef} />
    </div>
  );
}
export function MarketingBranchSlot({
  target,
  children,
}: {
  target: HTMLElement | null;
  children: ReactNode;
}) {
  return target ? (
    createPortal(children, target)
  ) : (
    <div className="pointer-events-auto">{children}</div>
  );
}
export function MarketingComposerContext({
  headerTarget,
  destination,
  projectId,
  selectedInstanceId,
  onConnected,
  onSelected,
}: {
  headerTarget?: HTMLElement | null | undefined;
  destination?: EnvironmentId | null | undefined;
  projectId?: string | null | undefined;
  selectedInstanceId: string;
  onConnected: (selection: import("@t3tools/contracts").ModelSelection) => void;
  onSelected: (selection: import("@t3tools/contracts").ModelSelection) => void;
}) {
  const [setupOpen, setSetupOpen] = useState(false);
  const primary = usePrimaryEnvironmentId();
  const environmentId = destination ?? primary;
  const settings = useEnvironmentSettings(
    EnvironmentIdValue.make(environmentId ?? PRIMARY_LOCAL_ENVIRONMENT_ID),
  );
  const projectSettings = projectId
    ? resolveProjectSettings(settings, ProjectId.make(projectId))
    : null;
  const projectSelection =
    projectSettings?.sources.defaultModelSelection === "project"
      ? projectSettings.settings.defaultModelSelection
      : null;
  const providers = useEnvironmentProviders();
  const ready = environmentId
    ? hasReadyMarketingAssistant(providers.get(environmentId) ?? [])
    : false;
  const recoverAssistant = useEffectEvent((event: Event) => {
    const detail = (
      event as CustomEvent<{
        environmentId: EnvironmentId;
        selection: import("@t3tools/contracts").ModelSelection;
      }>
    ).detail;
    const current = environmentId
      ? providers.get(environmentId)?.find((provider) => provider.instanceId === selectedInstanceId)
      : undefined;
    if (
      detail.environmentId === environmentId &&
      !projectSelection &&
      getOnboardingProviderState(current) !== "ready"
    )
      onSelected(detail.selection);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Shell setup can recover an unavailable composer without replacing a domain override or a working chat's choice.
  useEffect(() => {
    window.addEventListener("amicited-assistant-selected", recoverAssistant);
    return () => window.removeEventListener("amicited-assistant-selected", recoverAssistant);
  }, []);
  const { rows: domains } = useDomains(environmentId);
  const domain = domains.find((row) => row.projectId === projectId);
  const [newDomainOpen, setNewDomainOpen] = useState(false);
  const site = domain ? (
    <Tooltip>
      <TooltipTrigger render={<span className="am-context-domain" />}>
        <BrandFavicon website={`https://${domain.hostname}`} name={domain.brand} />
        <span>{domain.hostname}</span>
      </TooltipTrigger>
      <TooltipPopup>{domain.hostname}</TooltipPopup>
    </Tooltip>
  ) : (
    <MarketingButton type="button" size="xs" variant="link" onClick={() => setNewDomainOpen(true)}>
      <Globe size={14} />
      Add domain
    </MarketingButton>
  );
  const cloud = <CloudConnectedChip destination={environmentId ?? undefined} />;
  return (
    <div>
      <NewDomainDialog open={newDomainOpen} onOpenChange={setNewDomainOpen} />
      {headerTarget
        ? createPortal(
            <div className="am-composer-context">
              {domain ? <span>Working on</span> : null}
              {site}
              {cloud}
            </div>,
            headerTarget,
          )
        : null}
      <div className="am-composer-context">
        {headerTarget ? null : site}
        {domain && environmentId && (
          <DomainConnection
            key={domain.projectId}
            domain={domain}
            destination={environmentId}
            quiet
          />
        )}
        {!ready && (
          <MarketingButton size="xs" variant="link" onClick={() => setSetupOpen(true)}>
            Choose assistant
          </MarketingButton>
        )}
        {headerTarget ? null : cloud}
      </div>
      {domain && environmentId && (
        <TrackingVisibility domain={domain} destination={environmentId} />
      )}
      <AssistantSetupDialog
        destination={environmentId}
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onSelected={(selection) => {
          const next = projectSelection ?? selection;
          onSelected(next);
          onConnected(next);
          setSetupOpen(false);
        }}
      />
    </div>
  );
}
export function MarketingTranscriptCard({
  output,
  status,
  projectedItem,
  environmentId,
  source,
}: {
  output: unknown;
  projectedItem?: OrchestrationV2ProjectedTurnItem | undefined;
  environmentId?: EnvironmentId | undefined;
  source?: TurnItemDetailSource | undefined;
  status?: string | undefined;
}) {
  const detail = useTurnItemDetail(
    projectedItem && environmentId && turnItemNeedsDetailFetch(projectedItem.item)
      ? {
          environmentId,
          threadId: projectedItem.sourceThreadId,
          itemId: projectedItem.sourceItemId,
          revision: turnItemDetailRevision(projectedItem.item),
        }
      : null,
    source,
  );
  const shell = useThreadShell(
    projectedItem && environmentId
      ? { environmentId, threadId: projectedItem.sourceThreadId }
      : null,
  );
  const { startTask } = useMarketingTask();
  const fetched = detail.data?.item;
  const result = marketingToolResult(fetched?.type === "dynamic_tool" ? fetched.output : output);
  const visible = useThreadVisibleTurnItems(
    projectedItem && environmentId
      ? { environmentId, threadId: projectedItem.sourceThreadId }
      : null,
  );
  const current =
    fetched?.type === "dynamic_tool"
      ? fetched
      : projectedItem?.item.type === "dynamic_tool"
        ? projectedItem.item
        : undefined;
  const input = current?.input as { tool?: string; arguments?: { run_id?: string } } | undefined;
  let cloud = cloudToolResult(current?.output ?? output);
  const runId = cloudRunId(current?.output ?? output);
  const family = input?.tool?.replace(/_(start|get)$/, "");
  const peers = visible.filter(
    (candidate) => candidate.item.type === "dynamic_tool" && candidate.item.id !== current?.id,
  );
  const peer =
    input?.tool?.endsWith("_start") && runId
      ? peers.toReversed().find((candidate) => {
          const args =
            candidate.item.type === "dynamic_tool"
              ? (candidate.item.input as { tool?: string; arguments?: { run_id?: string } })
              : undefined;
          return args?.tool === `${family}_get` && args.arguments?.run_id === runId;
        })
      : input?.tool?.endsWith("_get")
        ? peers.toReversed().find((candidate) => {
            const args =
              candidate.item.type === "dynamic_tool"
                ? (candidate.item.input as { tool?: string })
                : undefined;
            return (
              candidate.item.ordinal < (current?.ordinal ?? 0) && args?.tool === `${family}_start`
            );
          })
        : undefined;
  const peerDetail = useTurnItemDetail(
    peer && environmentId && turnItemNeedsDetailFetch(peer.item)
      ? {
          environmentId,
          threadId: peer.sourceThreadId,
          itemId: peer.sourceItemId,
          revision: turnItemDetailRevision(peer.item),
        }
      : null,
    source,
  );
  const peerItem = peerDetail.data?.item ?? peer?.item;
  const peerOutput = peerItem?.type === "dynamic_tool" ? peerItem.output : undefined;
  if (
    !result &&
    shell?.hasPendingApprovals &&
    visible.some(
      (p) =>
        p.item.type === "approval_request" &&
        p.item.status === "waiting" &&
        marketingApprovalTool(visible, p.item.requestId)?.id === projectedItem?.item.id,
    )
  )
    return null;
  if (marketingSubcheckCovered(projectedItem, visible)) return null;
  if (
    input?.tool?.endsWith("_get") &&
    input.arguments?.run_id &&
    cloudRunId(peerOutput) === input.arguments.run_id
  )
    return null;
  if (
    input?.tool?.endsWith("_start") &&
    runId &&
    peerItem?.type === "dynamic_tool" &&
    (peerItem.input as { arguments?: { run_id?: string } })?.arguments?.run_id === runId
  ) {
    const polled = cloudToolResult(peerOutput);
    if (polled) cloud = { ...polled, ...(cloud?.target ? { target: cloud.target } : {}) };
  }
  if (cloud)
    return (
      <CloudToolResultCard
        cloud={{
          ...cloud,
          arguments:
            fetched?.type === "dynamic_tool"
              ? fetched.input
              : projectedItem?.item.type === "dynamic_tool"
                ? projectedItem.item.input
                : cloud.arguments,
        }}
        onStartTrial={() => openCloudSubscription(environmentId, shell?.projectId)}
      />
    );
  if (
    !result &&
    projectedItem?.item.type === "dynamic_tool" &&
    projectedItem.item.toolName?.includes("amicited_cloud_call")
  )
    return (
      <CloudPendingApprovals
        tool={input?.tool}
        arguments={input?.arguments}
        threadRef={environmentId ? { environmentId, threadId: projectedItem.sourceThreadId } : null}
        fallback={
          <MarketingCallState status={status} input={projectedItem.item.input} output={output} />
        }
      />
    );
  if (!result)
    return (
      <MarketingCallState
        status={status}
        input={projectedItem?.item.type === "dynamic_tool" ? projectedItem.item.input : undefined}
        output={fetched?.type === "dynamic_tool" ? fetched.output : output}
      />
    );
  return (
    <ChatMarketingResult
      result={result}
      ask={() =>
        void startTask(resultQuestion(result), false, result).catch(() =>
          toastManager.add({
            type: "error",
            title: "Could not open your question. Please try again.",
          }),
        )
      }
    />
  );
}

function ChatMarketingResult({ result, ask }: { result: ToolResult; ask: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const firstWin = () => {
    if (!isUsefulResult(result)) return;
    try {
      localStorage.setItem("amicited.first-win", "true");
    } catch {
      /* Offers fall back to the server's first-win check when storage is blocked. */
    }
  };
  if (expanded) return <MarketingResult result={result} />;
  return (
    <CompactMarketingResult
      ask={() => {
        firstWin();
        ask();
      }}
      result={result}
      open={() => {
        firstWin();
        setExpanded(true);
      }}
    />
  );
}

export function MarketingTurnOffer({
  threadRef,
  runId,
}: {
  threadRef: ScopedThreadRef | null;
  runId: RunId | null;
}) {
  const items = useThreadVisibleTurnItems(threadRef);
  const candidates = items
    .filter(
      (p) =>
        p.item.runId === runId &&
        p.item.type === "dynamic_tool" &&
        (p.item.toolName?.endsWith("marketing_tools_run") ||
          p.item.toolName?.endsWith("amicited_connection")) &&
        p.item.status === "completed",
    )
    .toReversed();
  return <MarketingOfferCandidate candidates={candidates} threadRef={threadRef} />;
}
function MarketingOfferCandidate({
  candidates,
  threadRef,
}: {
  candidates: readonly OrchestrationV2ProjectedTurnItem[];
  threadRef: ScopedThreadRef | null;
}) {
  const projected = candidates[0];
  const detail = useTurnItemDetail(
    projected && threadRef && turnItemNeedsDetailFetch(projected.item)
      ? {
          environmentId: threadRef.environmentId,
          threadId: projected.sourceThreadId,
          itemId: projected.sourceItemId,
          revision: turnItemDetailRevision(projected.item),
        }
      : null,
  );
  const item = detail.data?.item ?? projected?.item;
  const result = item?.type === "dynamic_tool" ? marketingOfferResult(item.output) : null;
  if (result?.tool === "amicited.connection" && result.status === "hidden") return null;
  if (result && item && whatYouAreMissing(result))
    return (
      <CloudFooter result={{ ...result, id: item.id }} destination={threadRef?.environmentId} />
    );
  if (detail.isPending) return null;
  return candidates.length > 1 ? (
    <MarketingOfferCandidate candidates={candidates.slice(1)} threadRef={threadRef} />
  ) : null;
}

export function MarketingSignInRecovery({
  driver = "claudeAgent",
  threadRef,
  errorItemId,
}: {
  errorItemId?: string;
  driver?: "claudeAgent" | "codex";
  threadRef?: ScopedThreadRef | null;
}) {
  const [open, setOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendOnce] = useState(createMarketingResend);
  const startTurn = useOrchestrationCommand(threadEnvironment.startTurn);
  const setRuntimeMode = useOrchestrationCommand(threadEnvironment.setRuntimeMode);
  const thread = useThreadShell(threadRef ?? null);
  const resend: typeof startTurn = async (request) => {
    if (thread && request.input.runtimeMode !== thread.runtimeMode) {
      const result = await setRuntimeMode({
        environmentId: request.environmentId,
        input: {
          threadId: request.input.threadId,
          runtimeMode: request.input.runtimeMode,
          createdAt: new Date().toISOString(),
        },
      });
      if (result._tag === "Failure") return result;
    }
    return startTurn(request);
  };
  const items = useThreadVisibleTurnItems(threadRef ?? null);
  const providers = useEnvironmentProviders();
  const activeDriver = threadRef
    ? providers
        .get(threadRef.environmentId)
        ?.find((provider) => provider.instanceId === thread?.providerInstanceId)?.driver
    : driver;
  const provider = threadRef
    ? providers
        .get(threadRef.environmentId)
        ?.find((p) => p.instanceId === thread?.providerInstanceId)
    : undefined;
  const ready =
    provider &&
    (provider.driver === "claudeAgent" || provider.driver === "codex") &&
    getOnboardingProviderState(provider) === "ready";
  const signInDriver = activeDriver === "codex" ? "codex" : "claudeAgent";
  const label = signInDriver === "codex" ? "ChatGPT" : "Claude";
  const latestError = items.findLast((p) => p.item.type === "error" && p.item.status === "failed");
  if (errorItemId && latestError && latestError.item.id !== errorItemId) return null;
  if (
    latestError &&
    thread?.latestRun?.status !== "failed" &&
    latestError.item.runId !== thread?.latestRun?.runId
  )
    return null;
  return (
    <article className="am-tool-card" aria-label="Assistant sign in">
      <strong>{ready ? `${label} is ready` : `${label} isn't signed in yet`}</strong>
      <p>
        {ready
          ? "Your message is saved. Send it again to continue."
          : "Sign in with your existing subscription to continue."}
      </p>
      <MarketingButton
        variant="default"
        disabled={resending}
        onClick={() => {
          if (ready) {
            const last = items.findLast(
              (p) =>
                p.item.type === "user_message" &&
                (!latestError || p.item.runId === latestError.item.runId),
            )?.item;
            if (threadRef && last?.type === "user_message") {
              if (resending || !thread) return;
              setResending(true);
              void resendOnce(Boolean(ready), resend, {
                environmentId: threadRef.environmentId,
                input: {
                  threadId: threadRef.threadId,
                  message: {
                    messageId: last.messageId,
                    role: "user",
                    text: last.text,
                    attachments: last.attachments,
                    ...(last.context ? { context: last.context } : {}),
                  },
                  runtimeMode: resolveEffectiveRuntimeMode(thread.runtimeMode),
                  interactionMode: thread.interactionMode,
                },
              }).then((result) => {
                if (result?._tag === "Failure") {
                  setResending(false);
                  toastManager.add({ type: "error", title: "Could not try again. Please retry." });
                }
              });
            }
          } else setOpen(true);
        }}
      >
        {ready ? "Try again" : `Sign in to ${label}`}
      </MarketingButton>
      {open && <MarketingSubscriptions initialDriver={signInDriver} usageLink={false} />}
    </article>
  );
}

export function useMarketingApproval(threadRef: ScopedThreadRef | null, requestId: string) {
  const items = useThreadVisibleTurnItems(threadRef);
  const marketer = useWorkspaceMode() === "marketer";
  const tool = marketingApprovalTool(items, requestId);
  return marketer && tool ? marketingApprovalInput(tool.toolName, tool.input) : null;
}
export function MarketingApprovalCard({
  input,
  approval,
  disabled,
  onRespond,
}: {
  input: NonNullable<ReturnType<typeof marketingApprovalInput>>;
  approval: import("./session-logic").PendingApproval;
  disabled: boolean;
  onRespond:
    | ((
        requestId: import("@t3tools/contracts").RuntimeRequestId,
        decision: "accept" | "decline",
      ) => unknown)
    | undefined;
}) {
  const title = resultTitle({ tool: input.name ?? "" });
  let site = input.input?.url;
  try {
    if (site) site = new URL(site).hostname;
  } catch {
    /* Preserve supplied target. */
  }
  return (
    <WorkLogRow
      role="group"
      aria-label="Marketing approval"
      wrapLabel
      icon={<Shield className="size-4 text-icon-muted" />}
      label={
        <>
          Run {title.toLowerCase()}
          {site ? ` on ${site}` : ""}? It's free and runs on your computer.
        </>
      }
    >
      <div className="ms-7.5 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-warning-foreground">Needs your OK</span>
        <span className="h-4 border-l border-border" />
        {onRespond && (
          <ComposerPendingApprovalActions
            presentation="composer"
            declineVariant="ghost"
            requestId={approval.requestId}
            canRespond={!disabled}
            disabled={disabled}
            isResponding={false}
            options={[
              { decision: "accept", label: "Allow" },
              { decision: "decline", label: "Don't allow" },
            ]}
            onRespondToApproval={async (id, decision) => {
              if (decision === "accept" || decision === "decline") await onRespond(id, decision);
            }}
          />
        )}
      </div>
    </WorkLogRow>
  );
}

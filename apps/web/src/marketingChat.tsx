import { WorkLogRow } from "./components/chat/WorkLog";
import { ComposerPendingApprovalActions } from "./components/chat/ComposerPendingApprovalActions";
import { Shield } from "lucide-react";
import { Globe } from "lucide-react";
import { Popover, PopoverTrigger, PopoverPopup } from "./components/ui/popover";
import { whatYouAreMissing } from "@amicited/cloud-client/upsell";
import { createMarketingResend } from "./marketingRecovery";
import { useOrchestrationCommand } from "./state/use-orchestration-command";
import { threadEnvironment } from "./state/threads";
import { toastManager } from "./components/ui/toast";
import {
  marketingSubcheckCovered,
  marketingApprovalTool,
  marketingApprovalInput,
  shouldResumeMarketingDraft,
} from "./marketingContext";
import { useThreadVisibleTurnItems, useThreadShell } from "./state/entities";
import { CloudFooter } from "./rpc/amicitedCloud";
import type { ScopedThreadRef, RunId } from "@t3tools/contracts";
import { resolveAppModelSelectionState } from "./modelSelection";
import { usePrimarySettings } from "./hooks/useSettings";
import type { EnvironmentId, OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import { useTurnItemDetail, type TurnItemDetailSource } from "./state/queries";
import {
  turnItemNeedsDetailFetch,
  turnItemDetailRevision,
} from "@t3tools/client-runtime/work-log/item-detail";
import { usePrimaryEnvironmentId, useEnvironmentProviders } from "./state/environments";
import { getOnboardingProviderState } from "./onboarding/providerReadiness.logic";
/* oxlint-disable shadcn/no-unknown-classes -- Marketer styles are owned by @amicited/ui-marketing. */
import { useState, useEffect, useEffectEvent, useRef } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  CompactMarketingResult,
  marketingToolResult,
  readBrand,
  saveBrand,
  normalizeWebsite,
  MarketingInput,
  MarketingCallState,
  MarketingButton,
  resultTitle,
  resultQuestion,
  useWorkspaceMode,
} from "@amicited/ui-marketing";
import { MarketingSubscriptions, useMarketingTask } from "./marketing";
import { CloudConnectedChip } from "./rpc/amicitedCloud";
export function MarketingComposerContext({
  onSelected,
  onConnected,
  selectedInstanceId,
}: {
  selectedInstanceId: string;
  onConnected: (selection: import("@t3tools/contracts").ModelSelection) => void;
  onSelected: (selection: import("@t3tools/contracts").ModelSelection) => void;
}) {
  const [connecting, setConnecting] = useState<"claudeAgent" | "codex" | null>(null);
  const environmentId = usePrimaryEnvironmentId();
  const providers = useEnvironmentProviders();
  const selected = environmentId
    ? providers.get(environmentId)?.find((p) => p.instanceId === selectedInstanceId)
    : undefined;
  const connectingProvider =
    environmentId && connecting
      ? providers.get(environmentId)?.find((p) => p.driver === connecting)
      : undefined;
  const connectionReady =
    connectingProvider && getOnboardingProviderState(connectingProvider) === "ready";
  const ready = selected && getOnboardingProviderState(selected) === "ready";
  const settings = usePrimarySettings();
  const connectionSent = useRef(false);
  const sendAfterConnect = useRef(false);
  const finishConnection = useEffectEvent(() => {
    if (!connectingProvider) return;
    connectionSent.current = true;
    const selection = resolveAppModelSelectionState(settings, [connectingProvider]);
    onSelected(selection);
    if (shouldResumeMarketingDraft(sendAfterConnect.current ? "connect-and-send" : "manage", true))
      onConnected(selection);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Subscription authentication completes outside React; resume the preserved draft once readiness arrives.
  useEffect(() => {
    if (connecting && connectionReady && !connectionSent.current) finishConnection();
  }, [connecting, connectionReady]);
  const [brand, setBrand] = useState(readBrand);
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState(() => readBrand()?.website ?? "");
  const [websiteError, setWebsiteError] = useState("");
  return (
    <div>
      <div className="am-composer-context">
        <Popover open={editingWebsite} onOpenChange={setEditingWebsite}>
          <PopoverTrigger render={<MarketingButton variant="link" type="button" />}>
            <Globe size={14} />
            {brand?.website.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "Add your website"}
          </PopoverTrigger>
          {editingWebsite && (
            <PopoverPopup
              align="start"
              side="top"
              width="md"
              aria-label="Website"
              data-amicited-tokens=""
              data-amicited-popup=""
            >
              <div data-amicited-tokens="" className="am-website-editor">
                <label>
                  Website
                  <MarketingInput
                    value={websiteDraft}
                    onChange={(e) => setWebsiteDraft(e.target.value)}
                    autoFocus
                    required
                  />
                </label>
                <div className="am-website-actions">
                  <MarketingButton
                    variant="default"
                    type="button"
                    onClick={() => {
                      try {
                        const next = normalizeWebsite(websiteDraft);
                        const updated = { ...next, name: brand?.name ?? next.name };
                        saveBrand(updated);
                        setBrand(updated);
                        setEditingWebsite(false);
                        setWebsiteError("");
                      } catch {
                        setWebsiteError("Enter a website like example.com.");
                      }
                    }}
                  >
                    Save website
                  </MarketingButton>
                  <MarketingButton
                    variant="link"
                    type="button"
                    onClick={() => setEditingWebsite(false)}
                  >
                    Cancel
                  </MarketingButton>
                </div>
                <p role="alert">{websiteError}</p>
              </div>
            </PopoverPopup>
          )}
        </Popover>
        {ready ? (
          <MarketingButton
            variant="link"
            type="button"
            onClick={() => {
              sendAfterConnect.current = false;
              setConnecting(
                connecting ? null : selected?.driver === "codex" ? "codex" : "claudeAgent",
              );
            }}
          >
            Manage assistant
          </MarketingButton>
        ) : (
          <>
            <MarketingButton
              variant="link"
              type="button"
              onClick={() => {
                connectionSent.current = false;
                sendAfterConnect.current = true;
                setConnecting("claudeAgent");
              }}
            >
              Connect Claude
            </MarketingButton>
            <MarketingButton
              variant="link"
              type="button"
              onClick={() => {
                connectionSent.current = false;
                sendAfterConnect.current = true;
                setConnecting("codex");
              }}
            >
              Connect ChatGPT
            </MarketingButton>
          </>
        )}
        <CloudConnectedChip />
      </div>
      {connecting && (
        <MarketingSubscriptions
          initialDriver={connecting}
          usageLink={false}
          onSelected={onSelected}
        />
      )}
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
  const navigate = useNavigate();
  const path = useLocation({ select: (location) => location.pathname });
  const visible = useThreadVisibleTurnItems(
    projectedItem && environmentId
      ? { environmentId, threadId: projectedItem.sourceThreadId }
      : null,
  );
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
  if (!result)
    return (
      <MarketingCallState
        status={status}
        input={projectedItem?.item.type === "dynamic_tool" ? projectedItem.item.input : undefined}
        output={fetched?.type === "dynamic_tool" ? fetched.output : output}
      />
    );
  return (
    <CompactMarketingResult
      ask={() =>
        void startTask(resultQuestion(result), false, result).catch(() =>
          toastManager.add({
            type: "error",
            title: "Could not open your question. Please try again.",
          }),
        )
      }
      result={result}
      open={() => {
        sessionStorage.setItem("amicited.last-result", JSON.stringify(result));
        sessionStorage.setItem("amicited.return-chat", path);
        sessionStorage.setItem("amicited.result-origin." + result.id, path);
        void navigate({ to: "/tools/$toolName", params: { toolName: result.tool } });
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
        p.item.toolName?.endsWith("marketing_tools_run") &&
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
  const result = item?.type === "dynamic_tool" ? marketingToolResult(item.output) : null;
  if (result && whatYouAreMissing(result)) return <CloudFooter result={result} />;
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
  const resend = useOrchestrationCommand(threadEnvironment.startTurn);
  const items = useThreadVisibleTurnItems(threadRef ?? null);
  const thread = useThreadShell(threadRef ?? null);
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
                  runtimeMode: thread.runtimeMode,
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
        <span className="text-primary">Needs your OK</span>
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

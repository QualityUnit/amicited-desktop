import { useThreadVisibleTurnItems } from "./state/entities";
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
} from "@amicited/ui-marketing";
import { MarketingSubscriptions } from "./marketing";
import { CloudConnectedChip } from "./rpc/amicitedCloud";
export function MarketingComposerContext({
  onSelected,
  selectedInstanceId,
}: {
  selectedInstanceId: string;
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
  const finishConnection = useEffectEvent(() => {
    if (!connectingProvider) return;
    connectionSent.current = true;
    onSelected(resolveAppModelSelectionState(settings, [connectingProvider]));
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
        <MarketingButton type="button" onClick={() => setEditingWebsite(!editingWebsite)}>
          {brand?.website.replace(/^https?:\/\//, "") ?? "Add your website"}
        </MarketingButton>
        {editingWebsite && (
          <div className="am-website-popover" role="dialog" aria-label="Website">
            <label>
              Website
              <MarketingInput
                value={websiteDraft}
                onChange={(e) => setWebsiteDraft(e.target.value)}
                autoFocus
                required
              />
            </label>
            <MarketingButton
              type="button"
              onClick={() => {
                try {
                  const next = normalizeWebsite(websiteDraft);
                  saveBrand(next);
                  setBrand(next);
                  setEditingWebsite(false);
                  setWebsiteError("");
                } catch {
                  setWebsiteError("Enter a website like example.com.");
                }
              }}
            >
              Save website
            </MarketingButton>
            <MarketingButton type="button" onClick={() => setEditingWebsite(false)}>
              Cancel
            </MarketingButton>
            <p role="alert">{websiteError}</p>
          </div>
        )}
        {ready ? (
          <MarketingButton
            type="button"
            onClick={() =>
              setConnecting(
                connecting ? null : selected?.driver === "codex" ? "codex" : "claudeAgent",
              )
            }
          >
            Manage assistant
          </MarketingButton>
        ) : (
          <>
            <MarketingButton
              type="button"
              onClick={() => {
                connectionSent.current = false;
                setConnecting("claudeAgent");
              }}
            >
              Connect Claude
            </MarketingButton>
            <MarketingButton
              type="button"
              onClick={() => {
                connectionSent.current = false;
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
  const fetched = detail.data?.item;
  const result = marketingToolResult(fetched?.type === "dynamic_tool" ? fetched.output : output);
  const navigate = useNavigate();
  const path = useLocation({ select: (location) => location.pathname });
  if (!result)
    return (
      <MarketingCallState
        status={status}
        output={fetched?.type === "dynamic_tool" ? fetched.output : output}
      />
    );
  return (
    <CompactMarketingResult
      result={result}
      open={() => {
        sessionStorage.setItem("amicited.last-result", JSON.stringify(result));
        sessionStorage.setItem("amicited.return-chat", path);
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
  const projected = items.findLast(
    (p) =>
      p.item.runId === runId &&
      p.item.type === "dynamic_tool" &&
      p.item.toolName?.includes("marketing_tools_run"),
  );
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
  return result ? <CloudFooter result={result} /> : null;
}

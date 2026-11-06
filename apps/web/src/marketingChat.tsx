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
import { useState, useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import {
  CompactMarketingResult,
  marketingToolResult,
  readBrand,
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
  const label =
    selected?.driver === "codex"
      ? "ChatGPT"
      : selected?.driver === "claudeAgent"
        ? "Claude"
        : selected?.displayName;
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
  const brand = readBrand();
  const navigate = useNavigate();
  return (
    <div>
      <div className="am-composer-context">
        <MarketingButton type="button" onClick={() => void navigate({ to: "/settings/general" })}>
          {brand?.website.replace(/^https?:\/\//, "") ?? "Add your website"}
        </MarketingButton>
        {ready ? (
          <span>Using {label}</span>
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
      {connecting && !ready && <MarketingSubscriptions usageLink={false} onSelected={onSelected} />}
    </div>
  );
}
export function MarketingTranscriptCard({
  output,
  fallback,
  projectedItem,
  environmentId,
  source,
}: {
  output: unknown;
  projectedItem?: OrchestrationV2ProjectedTurnItem | undefined;
  environmentId?: EnvironmentId | undefined;
  source?: TurnItemDetailSource | undefined;
  fallback: ReactNode;
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
  if (!result) return fallback;
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

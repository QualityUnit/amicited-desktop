import { WorkLogRow } from "../components/chat/WorkLog";
import { Button } from "../components/ui/button";
import { AsyncResult, Atom } from "effect/reactivity";
import * as Option from "effect/Option";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "../components/ui/collapsible";
import { ChevronRight, Cloud } from "lucide-react";
import { useThreadVisibleTurnItems } from "../state/entities";
import { useWorkspaceMode } from "@amicited/ui-marketing";
import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
import { usePrimaryEnvironmentId } from "../state/environments";
export function CloudDisclosure({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex items-center gap-2 text-sm text-muted-foreground">
        <ChevronRight className="size-3 group-data-open:rotate-90" />
        {label}
      </CollapsibleTrigger>
      <CollapsiblePanel animate={false}>{children}</CollapsiblePanel>
    </Collapsible>
  );
}
const approval = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.answerApproval",
  label: "cloud:approval",
});
const approvalStream = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  tag: "amicited.cloud.subscribeApprovals",
  label: "cloud:approvals",
  idleTtlMs: 0,
});
const emptyPending: readonly PendingCloudApproval[] = [];
type PendingCloudApproval = {
  requestId: string;
  threadId: string;
  tool: string;
  free: boolean;
  readOnly: boolean;
  arguments: Record<string, unknown>;
  message: string;
};
const noApprovals = Atom.make(AsyncResult.success(emptyPending));
export function useCloudApprovals(
  environmentId: import("@t3tools/contracts").EnvironmentId | null | undefined,
) {
  const value = useAtomValue(
    environmentId ? approvalStream({ environmentId, input: undefined }) : noApprovals,
  );
  return Option.getOrElse(AsyncResult.value(value), () => emptyPending);
}
export function CloudPendingApprovals({
  threadRef,
  tool,
  arguments: args,
  fallback,
  unclaimed,
}: {
  threadRef: import("@t3tools/contracts").ScopedThreadRef | null;
  fallback?: React.ReactNode;
  unclaimed?: readonly { tool: unknown; arguments: unknown }[];
  tool?: unknown;
  arguments?: unknown;
}) {
  const requests = useCloudApprovals(threadRef?.environmentId);
  const matching = requests.filter(
    (request) =>
      request.threadId === threadRef?.threadId &&
      (unclaimed
        ? !unclaimed.some((call) => matchesCloudApproval(request, call.tool, call.arguments))
        : tool === undefined || matchesCloudApproval(request, tool, args)),
  );
  return matching.length
    ? matching.map((request) => (
        <CloudApproval
          key={request.requestId}
          request={request}
          tool={request.tool}
          environmentId={threadRef?.environmentId}
        />
      ))
    : (fallback ?? null);
}
export function CloudUnclaimedApprovals({
  threadRef,
}: {
  threadRef: import("@t3tools/contracts").ScopedThreadRef | null;
}) {
  const visible = useThreadVisibleTurnItems(threadRef);
  const marketer = useWorkspaceMode() === "marketer";
  const claimed = marketer
    ? visible.flatMap(({ item }) => {
        if (
          item.type !== "dynamic_tool" ||
          !item.toolName?.includes("amicited_cloud_call") ||
          item.status === "completed" ||
          item.status === "failed"
        )
          return [];
        const input = item.input as { tool?: unknown; arguments?: unknown } | undefined;
        return input ? [{ tool: input.tool, arguments: input.arguments }] : [];
      })
    : [];
  return <CloudPendingApprovals threadRef={threadRef} unclaimed={claimed} />;
}
function matchesCloudApproval(request: PendingCloudApproval, tool: unknown, args: unknown) {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)]),
      );
    return value;
  };
  return (
    request.tool === tool &&
    JSON.stringify(normalize(request.arguments)) === JSON.stringify(normalize(args))
  );
}
function CloudApproval({
  request,
  environmentId: destination,
}: {
  request: {
    requestId: string;
    message: string;
    free: boolean;
    readOnly?: boolean;
    arguments?: Record<string, unknown>;
  };
  tool: string;
  environmentId?: import("@t3tools/contracts").EnvironmentId | undefined;
}) {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const environmentId = destination ?? primaryEnvironmentId;
  const answer = useAtomCommand(approval);
  const allowed = useAtomValue(approval.permissionAtom(environmentId));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  return (
    <aside aria-label="AmICited approval">
      <WorkLogRow icon={<Cloud className="size-3.5" />} label={request.message} wrapLabel>
        <div className="ms-7.5 flex flex-wrap items-center gap-2 text-xs">
          {(
            [
              ["decline", "Don’t allow"],
              ["accept", "Allow"],
              ...(request.free || request.readOnly
                ? ([
                    [
                      "acceptForSession",
                      request.free
                        ? "Allow free checks in this chat"
                        : "Allow AmICited lookups in this chat",
                    ],
                  ] as const)
                : []),
            ] as const
          ).map(([decision, label]) => (
            <Button
              key={decision}
              size="xs"
              variant="outline"
              disabled={busy || !allowed}
              onClick={async () => {
                if (!environmentId) return;
                setBusy(true);
                setFailure(false);
                try {
                  const response = await answer({
                    environmentId,
                    input: { requestId: request.requestId, decision },
                  });
                  if (response._tag !== "Success") setFailure(true);
                } catch {
                  setFailure(true);
                }
                setBusy(false);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="ms-7.5 text-xs">
          <CloudDisclosure label="Inputs">
            <pre>{JSON.stringify(request.arguments, null, 2)}</pre>
          </CloudDisclosure>
        </div>
        {failure && (
          <p role="alert">Could not answer this approval. It may no longer be pending.</p>
        )}
      </WorkLogRow>
    </aside>
  );
}

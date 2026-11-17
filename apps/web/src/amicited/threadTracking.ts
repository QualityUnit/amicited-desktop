import { useEffect, useEffectEvent, useState } from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { TrackingRun } from "@amicited/cloud-client/tracking";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";
import { useAtomCommand } from "../state/use-atom-command";
const detail = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tracking.detail",
  label: "tracking:thread-detail",
});
export function usePersistedThreadRun(threadRef: ScopedThreadRef | null, milestones: string) {
  const read = useEffectEvent(useAtomCommand(detail));
  const [loaded, setLoaded] = useState<{ threadId: string; run: TrackingRun | null } | null>(null);
  const environmentId = threadRef?.environmentId;
  const threadId = threadRef?.threadId;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Reload and run updates resolve the durable thread association independently of editable configs.
  useEffect(() => {
    if (!environmentId || !threadId || milestones.length === 0) return;
    let active = true;
    void read({ environmentId, input: { threadId } }).then((r) => {
      if (active && r._tag === "Success") setLoaded({ threadId, run: r.value });
    });
    return () => {
      active = false;
    };
  }, [environmentId, threadId, milestones]);
  return loaded?.threadId === threadId ? (loaded?.run ?? null) : null;
}

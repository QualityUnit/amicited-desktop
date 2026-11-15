import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import type { Connection } from "@amicited/cloud-client/model";
import { connectionAtomRuntime } from "./connection/runtime";
import { useAtomCommand } from "./state/use-atom-command";
import { useEffect, useEffectEvent } from "react";
import { createLocalApi } from "./localApi";

const resetAccess = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.cloud.resetAccess",
  label: "cloud:reset-access",
});
let pending: { environmentId: EnvironmentId; projectId?: string | undefined } | undefined;
export function openCloudSubscription(environmentId?: EnvironmentId | null, projectId?: string) {
  pending = environmentId ? { environmentId, projectId } : undefined;
  window.dispatchEvent(new Event("amicited-subscription-opened"));
  void createLocalApi().shell.openExternal("https://app.flowhunt.io/amicited/subscription");
}
export function useSubscriptionRefresh(
  environmentId: EnvironmentId | null | undefined,
  projectId: string | undefined,
  onChange: (connection: Connection) => void,
) {
  const reset = useAtomCommand(resetAccess);
  const refresh = useEffectEvent(async () => {
    if (
      !pending ||
      pending.environmentId !== environmentId ||
      pending.projectId !== projectId ||
      !environmentId
    )
      return;
    pending = undefined;
    const result = await reset({ environmentId, input: projectId ? { projectId } : {} });
    if (result._tag === "Success") onChange(result.value);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Trials complete in an external browser; reset the originating connection on return.
  useEffect(() => {
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, []);
}

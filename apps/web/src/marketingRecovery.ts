import type { StartThreadTurnInput } from "@t3tools/client-runtime/operations";
import type { EnvironmentId } from "@t3tools/contracts";

export function createMarketingResend() {
  let pending = false;
  return async (
    ready: boolean,
    send: (request: {
      environmentId: EnvironmentId;
      input: StartThreadTurnInput;
    }) => Promise<{ _tag: string }>,
    request: { environmentId: EnvironmentId; input: StartThreadTurnInput },
  ) => {
    if (!ready || pending) return;
    pending = true;
    try {
      const result = await send(request);
      if (result._tag === "Failure") pending = false;
      return result;
    } catch (error) {
      pending = false;
      throw error;
    }
  };
}

import { jsonToolResult as normalize } from "@amicited/cloud-client/toolResult";
import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

export const jsonToolResult = Effect.fn("Amicited.toolResult")((value: unknown) =>
  normalize(value).pipe(
    Effect.tapError((error) =>
      Effect.logError("Could not encode AmICited tool result", error.cause),
    ),
    Effect.mapError(
      (error) =>
        new OrchestratorMcpFailure({ code: "orchestration_error", message: error.message }),
    ),
  ),
);

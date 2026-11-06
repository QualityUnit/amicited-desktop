import { expect, it } from "@effect/vitest";
import { ProviderInstanceId, TextGenerationError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { fromRunner, type Request } from "./textGenerationOperations.ts";
it.effect(
  "marketing generation preserves the prompt and full answer through the existing runner",
  () =>
    Effect.gen(function* () {
      const calls: Request<Schema.Top>[] = [];
      const text = "A full answer. ".repeat(100);
      const provider = fromRunner("Fixture", (request) => {
        calls.push(request);
        // oxlint-disable-next-line t3code/no-inline-schema-compile -- The runner receives a different output schema for each operation.
        return Schema.decodeEffect(request.outputSchema)({ text }).pipe(
          Effect.mapError(
            (cause) =>
              new TextGenerationError({
                operation: request.operation,
                detail: "Fixture schema mismatch",
                cause,
              }),
          ),
        );
      });
      const result = yield* provider.generateMarketingText!({
        cwd: "/home/user",
        prompt: "Write a garden guide.",
        modelSelection: { instanceId: ProviderInstanceId.make("fixture"), model: "fixture-model" },
      });
      expect(result.text).toBe(text);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        operation: "generateMarketingText",
        prompt: "Write a garden guide.",
        cwd: "/home/user",
      });
    }),
);

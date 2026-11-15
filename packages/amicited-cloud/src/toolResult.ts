import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export class ToolResultEncodingError extends Schema.TaggedError<ToolResultEncodingError>()(
  "ToolResultEncodingError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "AmICited returned data the app could not read";
  }
}

export const jsonToolResult = Effect.fn("Amicited.jsonToolResult")((value: unknown) =>
  Effect.try({
    try: (): unknown => {
      // @effect-diagnostics-next-line globalJsonInEffect:off -- JSON coercion is intentional and guarded by Effect.try.
      const json = JSON.stringify(value, (_key, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      );
      if (json === undefined) throw new TypeError("Tool result has no JSON representation");
      // @effect-diagnostics-next-line globalJsonInEffect:off -- Parse only the normalized string inside Effect.try.
      return JSON.parse(json);
    },
    catch: (cause) => new ToolResultEncodingError({ cause }),
  }),
);

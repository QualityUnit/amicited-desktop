import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { createMarketingTools } from "./index.ts";
import type { ToolCard, ToolResult } from "@amicited/tools-core";
export class MarketingTools extends Context.Service<
  MarketingTools,
  {
    readonly list: Effect.Effect<readonly ToolCard[]>;
    readonly run: (name: string, input: unknown) => Effect.Effect<ToolResult>;
  }
>()("@amicited/tools/service/MarketingTools") {}
export const layer = Layer.sync(MarketingTools, () => {
  const registry = createMarketingTools();
  return MarketingTools.of({
    list: Effect.sync(() => registry.list()),
    run: Effect.fn("MarketingTools.run")((name: string, input: unknown) =>
      Effect.promise(() => registry.run(name, input)),
    ),
  });
});

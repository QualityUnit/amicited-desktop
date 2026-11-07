import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { createMarketingTools, type Generation } from "./index.ts";
import type { ToolCard, ToolResult } from "@amicited/tools-core";
export class MarketingTools extends Context.Service<
  MarketingTools,
  {
    readonly list: Effect.Effect<readonly ToolCard[]>;
    readonly run: (name: string, input: unknown) => Effect.Effect<ToolResult>;
  }
>()("@amicited/tools/service/MarketingTools") {}
export const makeLayer = (provider?: Generation) =>
  Layer.sync(MarketingTools, () => {
    const registry = createMarketingTools(provider);
    return MarketingTools.of({
      list: Effect.sync(() => registry.list()),
      run: Effect.fn("MarketingTools.run")((name: string, input: unknown) =>
        Effect.promise(() => registry.run(name, input)),
      ),
    });
  });

export const layer = makeLayer();

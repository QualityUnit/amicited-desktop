import * as Effect from "effect/Effect";
import * as MarketingTools from "@amicited/tools/service";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { MarketingToolkit } from "./tools.ts";
export const layer = McpToolAccess.toLayer(MarketingToolkit, {
  marketing_tools_search: McpToolAccess.reads((input) =>
    Effect.gen(function* () {
      const service = yield* MarketingTools.MarketingTools;
      const cards = yield* service.list;
      const words = (input.query ?? "").toLowerCase().trim().split(/\s+/);
      return cards.filter((card) =>
        words.every((word) =>
          [card.name, card.title, card.description, ...card.keywords]
            .join(" ")
            .toLowerCase()
            .includes(word),
        ),
      );
    }),
  ),
  marketing_tools_run: McpToolAccess.writesEnvironment((input) =>
    Effect.gen(function* () {
      const service = yield* MarketingTools.MarketingTools;
      return yield* service.run(input.name, input.input);
    }),
  ),
});

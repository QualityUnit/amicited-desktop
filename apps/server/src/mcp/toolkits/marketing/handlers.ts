import { unavailable } from "../../threadAccess.ts";
import { MarketingCaller } from "../../../marketing/MarketingToolsLive.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
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
      const scope = yield* McpInvocationContext.McpInvocationContext;
      if (!scope.thread) return yield* service.run(input.name, input.input);
      const threads = yield* ThreadManagementService.ThreadManagementService;
      const thread = yield* threads
        .getThreadShell(scope.thread.threadId)
        .pipe(Effect.mapError(unavailable));
      return yield* service
        .run(input.name, input.input)
        .pipe(Effect.provideService(MarketingCaller, { selection: thread?.modelSelection }));
    }),
  ),
});

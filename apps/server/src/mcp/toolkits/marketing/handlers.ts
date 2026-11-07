import { usefulMarketingResult } from "@amicited/cloud-client";
import { AmicitedCloud } from "../../../amicited/Cloud.ts";
import { unavailable } from "../../threadAccess.ts";
import { MarketingCaller } from "../../../marketing/MarketingToolsLive.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as Effect from "effect/Effect";
import * as MarketingTools from "@amicited/tools/service";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { MarketingToolkit } from "./tools.ts";
export const layer = McpToolAccess.toLayer(MarketingToolkit, {
  amicited_connection: McpToolAccess.reads(({ request }) =>
    Effect.gen(function* () {
      const cloud = yield* AmicitedCloud;
      const scope = yield* McpInvocationContext.McpInvocationContext;
      let offersAllowed = false;
      let firstWin = false;
      if (scope.thread) {
        const threads = yield* ThreadManagementService.ThreadManagementService;
        const records = yield* threads
          .getThreadRecords(scope.thread.threadId, ["messages", "turnItems"])
          .pipe(Effect.mapError(unavailable));
        const latest = records.messages.filter((m) => m.role === "user").at(-1);
        const context = latest?.context?.records.find(
          (r) => r.kind === "marketing-website" || r.kind === "marketing-workspace",
        );
        const payload = context && "payload" in context ? context.payload : undefined;
        if (payload && typeof payload === "object") {
          offersAllowed = "offersAllowed" in payload && payload.offersAllowed === true;
          firstWin = "firstWin" in payload && payload.firstWin === true;
        }
        firstWin ||= records.turnItems.some(
          (item) =>
            item.type === "dynamic_tool" &&
            item.status === "completed" &&
            item.toolName?.endsWith("marketing_tools_run") &&
            usefulMarketingResult(item.output),
        );
      }
      return yield* Effect.promise(() =>
        cloud.connectionForRequest(request, offersAllowed, firstWin),
      );
    }),
  ),
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

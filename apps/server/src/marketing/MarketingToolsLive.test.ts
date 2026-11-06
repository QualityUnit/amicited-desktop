import { expect, it } from "@effect/vitest";
import { DEFAULT_SERVER_SETTINGS, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MarketingTools from "@amicited/tools/service";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as MarketingToolsLive from "./MarketingToolsLive.ts";
it.effect(
  "the server library works without an account and resolves caller selection before standalone defaults",
  () => {
    const requested: string[] = [];
    return Effect.gen(function* () {
      const tools = yield* MarketingTools.MarketingTools;
      const caller = { instanceId: ProviderInstanceId.make("claudeAgent"), model: "haiku" };
      yield* tools
        .run("content.write", { brief: "A launch", channel: "email", tone: "warm" })
        .pipe(Effect.provideService(MarketingToolsLive.MarketingCaller, { selection: caller }));
      yield* tools
        .run("content.write", { brief: "A launch", channel: "email", tone: "warm" })
        .pipe(Effect.provideService(MarketingToolsLive.MarketingCaller, { selection: undefined }));
      expect(requested).toEqual(["claudeAgent"]);
      expect(yield* tools.list).toHaveLength(14);
      expect(
        yield* tools.run("ai.visibility.check", {
          brand: "Acme",
          website: "https://example.com",
          category: "garden tools",
        }),
      ).toMatchObject({
        status: "success",
        output: { status: "needs_provider", summary: { answered: 0, shareOfVoice: null } },
      });
      expect(
        yield* tools.run("content.write", { brief: "A launch", channel: "email", tone: "warm" }),
      ).toMatchObject({ status: "success", output: { status: "needs_provider" } });
      expect(requested).toEqual(["claudeAgent", "standalone", "standalone"]);
    }).pipe(
      Effect.provide(
        MarketingToolsLive.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.mock(ProviderInstanceRegistry.ProviderInstanceRegistry)({
                getInstance: (id) => {
                  requested.push(id);
                  return Effect.undefined;
                },
              }),
              Layer.mock(ServerSettings.ServerSettingsService)({
                getSettings: Effect.succeed({
                  ...DEFAULT_SERVER_SETTINGS,
                  textGenerationModelSelection: {
                    instanceId: ProviderInstanceId.make("standalone"),
                    model: "standalone-model",
                  },
                }),
              }),
            ),
          ),
        ),
      ),
    );
  },
);

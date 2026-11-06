import * as Context from "effect/Context";
import type { ModelSelection } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as MarketingTools from "@amicited/tools/service";
import type { Generation } from "@amicited/tools";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";

export class MarketingCaller extends Context.Service<
  MarketingCaller,
  { readonly selection: ModelSelection | undefined }
>()("t3/marketing/MarketingToolsLive/MarketingCaller") {}

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const context = yield* Effect.context<never>();
    const instances = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
    const settings = yield* ServerSettings.ServerSettingsService;
    // Resolve on each tool invocation so connecting an assistant takes effect without restarting.
    return Layer.succeed(
      MarketingTools.MarketingTools,
      MarketingTools.MarketingTools.of({
        list: MarketingTools.MarketingTools.pipe(
          Effect.flatMap((service) => service.list),
          Effect.provide(MarketingTools.layer),
        ),
        run: Effect.fn("MarketingTools.run")(function* (name: string, input: unknown) {
          const config = yield* settings.getSettings.pipe(Effect.orElseSucceed(() => null));
          const caller = yield* Effect.serviceOption(MarketingCaller);
          const selection =
            caller._tag === "Some" ? caller.value.selection : config?.textGenerationModelSelection;
          const instance = selection
            ? yield* instances.getInstance(selection.instanceId)
            : undefined;
          const snapshot = instance ? yield* instance.snapshot.getSnapshot : undefined;
          const generate = instance?.textGeneration.generateMarketingText;
          const provider: Generation | undefined =
            selection &&
            generate &&
            snapshot?.enabled &&
            snapshot.installed &&
            snapshot.auth.status !== "unauthenticated"
              ? {
                  provider: String(selection.instanceId),
                  assistant: instance.driverKind,
                  model: selection.model,
                  generate: async (prompt, signal) => {
                    const result = await Effect.runPromiseWith(context)(
                      generate({ cwd: process.cwd(), prompt, modelSelection: selection }),
                      { signal },
                    );
                    return result.text;
                  },
                }
              : undefined;
          return yield* MarketingTools.MarketingTools.pipe(
            Effect.flatMap((service) => service.run(name, input)),
            Effect.provide(MarketingTools.makeLayer(provider)),
          );
        }),
      }),
    );
  }),
);

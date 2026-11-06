import { CloudClient } from "@amicited/cloud-client";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as ExternalLauncher from "../process/externalLauncher.ts";

export class AmicitedCloud extends Context.Service<AmicitedCloud, CloudClient>()(
  "t3/amicited/Cloud/AmicitedCloud",
) {}
export const layer = Layer.effect(
  AmicitedCloud,
  Effect.gen(function* () {
    const launcher = yield* ExternalLauncher.ExternalLauncher;
    const config = yield* ServerConfig.ServerConfig;
    const account = config.stateDir;
    const context = yield* Effect.context<never>();
    const entry = async () => {
      const { AsyncEntry } = await import("@napi-rs/keyring");
      return new AsyncEntry("AmICited Desktop Cloud", account);
    };
    const missing = (error: unknown) =>
      /NoEntry|no (matching )?entry|not found/i.test(String(error));
    return new CloudClient({
      secrets: {
        read: async () => {
          try {
            return await (await entry()).getPassword();
          } catch (error) {
            if (missing(error)) return undefined;
            throw error;
          }
        },
        write: async (value) => (await entry()).setPassword(value),
        clear: async () => {
          try {
            await (await entry()).deleteCredential();
          } catch (error) {
            if (!missing(error)) throw error;
          }
        },
      },
      openExternal: (url) =>
        Effect.runPromiseWith(context)(
          launcher.launchBrowser(url).pipe(Effect.withTracerEnabled(false)),
        ),
    });
  }),
);

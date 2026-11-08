import * as FileSystem from "effect/FileSystem";
import { CloudClient } from "@amicited/cloud-client";
import * as Config from "effect/Config";
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
    const fs = yield* FileSystem.FileSystem;
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
    const capture = yield* Config.String("T3CODE_DEV_REPLAY_CAPTURE").pipe(Config.withDefault(""));
    const endpoint = yield* Config.String("T3CODE_DEV_AMICITED_ENDPOINT").pipe(
      Config.withDefault(""),
    );
    const oauthLog = yield* Config.String("AMICITED_OAUTH_CAPTURE_URL").pipe(
      Config.withDefault(""),
    );
    const fixtureEndpoint =
      capture === "1" && /^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(endpoint) ? endpoint : undefined;
    const cloud = new CloudClient({
      ...(fixtureEndpoint ? { endpoint: fixtureEndpoint } : {}),
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
      openExternal: async (url) => {
        await Effect.runPromiseWith(context)(
          launcher.launchBrowser(url).pipe(Effect.withTracerEnabled(false)),
        );
        if (capture === "1" && oauthLog) {
          const redacted = new URL(url);
          redacted.searchParams.set("state", "REDACTED");
          await Effect.runPromiseWith(context)(fs.writeFileString(oauthLog, redacted.href));
        }
      },
    });
    yield* Effect.addFinalizer(() => Effect.promise(() => cloud.close()));
    return cloud;
  }),
);

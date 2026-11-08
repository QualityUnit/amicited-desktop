import { ProjectLifecycle } from "../project/ProjectService.ts";
import * as Schema from "effect/Schema";
import { DomainRecord } from "@amicited/cloud-client/rpc";
import { DomainConnections } from "@amicited/cloud-client/domains";
import * as FileSystem from "effect/FileSystem";
import { CloudClient } from "@amicited/cloud-client";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as ExternalLauncher from "../process/externalLauncher.ts";

const decodeDomains = Schema.decodeUnknownSync(Schema.Array(DomainRecord));

const decodeMembership = Schema.decodeUnknownSync(
  Schema.Array(
    Schema.Struct({
      projectId: Schema.String,
      siteFiles: Schema.String,
    }),
  ),
);

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
    const entry = async (reference = account) => {
      const { AsyncEntry } = await import("@napi-rs/keyring");
      return new AsyncEntry("AmICited Desktop Cloud", reference);
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
    const secretsFor = (reference = account) => ({
      read: async () => {
        try {
          return await (await entry(reference)).getPassword();
        } catch (error) {
          if (missing(error)) return undefined;
          throw error;
        }
      },
      write: async (value: string) => (await entry(reference)).setPassword(value),
      clear: async () => {
        try {
          await (await entry(reference)).deleteCredential();
        } catch (error) {
          if (!missing(error)) throw error;
        }
      },
    });
    const openExternal = async (url: string) => {
      await Effect.runPromiseWith(context)(
        launcher.launchBrowser(url).pipe(Effect.withTracerEnabled(false)),
      );
      if (capture === "1" && oauthLog) {
        const redacted = new URL(url);
        redacted.searchParams.set("state", "REDACTED");
        await Effect.runPromiseWith(context)(fs.writeFileString(oauthLog, redacted.href));
      }
    };
    const cloud = new CloudClient({
      ...(fixtureEndpoint ? { endpoint: fixtureEndpoint } : {}),
      secrets: secretsFor(),
      openExternal,
    });
    const run = Effect.runPromiseWith(context);
    const metadataPath = `${config.stateDir}/amicited-domains.json`;
    const membershipPath = `${config.stateDir}/amicited-site-projects.json`;
    let knownSites: readonly import("@amicited/cloud-client/domains").Domain[] = [];
    const saveMembership = async (
      rows: readonly import("@amicited/cloud-client/domains").Domain[],
    ) => {
      const members = rows
        .filter((row) => row.siteFiles)
        .map(({ projectId, siteFiles }) => ({ projectId, siteFiles }));
      await run(fs.writeFileString(`${membershipPath}.tmp`, JSON.stringify(members)));
      await run(fs.rename(`${membershipPath}.tmp`, membershipPath));
    };
    cloud.domains = new DomainConnections({
      readSiteMembership: async () => [
        ...decodeMembership(JSON.parse(await run(fs.readFileString(membershipPath)))),
      ],
      read: async () => {
        try {
          if (!(await run(fs.exists(metadataPath)))) {
            if (await run(fs.exists(membershipPath)))
              throw new Error("Domain registry is missing.");
            return [];
          }
          const rows = [...decodeDomains(JSON.parse(await run(fs.readFileString(metadataPath))))];
          knownSites = rows;
          await saveMembership(rows).catch(() =>
            run(
              Effect.logWarning(
                "Could not save domain site membership; the next write will retry.",
              ),
            ),
          );
          return rows;
        } catch (error) {
          await run(
            Effect.logWarning(
              "Couldn't read your domains. Edits in site folders may not ask first.",
            ),
          );
          throw error;
        }
      },
      write: async (rows) => {
        await saveMembership([...knownSites, ...rows]);
        const temporary = `${metadataPath}.tmp`;
        await run(fs.writeFileString(temporary, JSON.stringify(rows)));
        await run(fs.rename(temporary, metadataPath));
        knownSites = rows;
        await saveMembership(rows);
      },
      secrets: (id) => secretsFor(`${account}:domain:${id}`),
      legacy: secretsFor(),
      migration: {
        complete: () => run(fs.exists(`${metadataPath}.migrated`)),
        finish: () => run(fs.writeFileString(`${metadataPath}.migrated`, "1")),
      },
      client: (secrets) =>
        new CloudClient({
          secrets,
          ...(fixtureEndpoint ? { endpoint: fixtureEndpoint } : {}),
          openExternal,
        }),
      changed: () => cloud.notifyApprovals(),
    });
    yield* Effect.addFinalizer(() => Effect.promise(() => cloud.close()));
    return cloud;
  }),
);

export const projectLifecycleLayer = Layer.effect(
  ProjectLifecycle,
  Effect.gen(function* () {
    const cloud = yield* AmicitedCloud;
    return {
      onProjectDeleted: Effect.fn("AmicitedCloud.onProjectDeleted")(function* (
        projectId: import("@t3tools/contracts").ProjectId,
      ) {
        if (cloud.domains) yield* Effect.promise(() => cloud.domains!.forget(projectId));
      }),
    };
  }),
);

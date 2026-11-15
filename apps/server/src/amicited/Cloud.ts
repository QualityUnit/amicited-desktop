import * as Reports from "./Reports.ts";
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
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as ExternalLauncher from "../process/externalLauncher.ts";
import { domainFaviconDirectory } from "./DomainFavicons.ts";
import { AmicitedIssues } from "./Issues.ts";

const decodeSetup = Schema.decodeUnknownSync(
  Schema.Struct({ finished: Schema.Boolean, lastDomain: Schema.optionalKey(Schema.String) }),
);
const decodeDomains = Schema.decodeUnknownSync(Schema.Array(DomainRecord));

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
    const setupPath = `${config.stateDir}/amicited-setup.json`;
    let setupWrites = Promise.resolve();
    cloud.setup = {
      read: async () => {
        if (!(await run(fs.exists(setupPath)))) return { finished: false };
        return decodeSetup(JSON.parse(await run(fs.readFileString(setupPath))));
      },
      write: (state) => {
        const next = setupWrites.then(async () => {
          await run(fs.writeFileString(`${setupPath}.tmp`, JSON.stringify(state)));
          await run(fs.rename(`${setupPath}.tmp`, setupPath));
        });
        setupWrites = next.catch(() => {});
        return next;
      },
    };
    const metadataPath = `${config.stateDir}/amicited-domains.json`;
    cloud.domains = new DomainConnections({
      read: async () => {
        if (!(await run(fs.exists(metadataPath)))) return [];
        return [...decodeDomains(JSON.parse(await run(fs.readFileString(metadataPath))))];
      },
      write: async (rows) => {
        const temporary = `${metadataPath}.tmp`;
        await run(fs.writeFileString(temporary, JSON.stringify(rows)));
        await run(fs.rename(temporary, metadataPath));
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
    const reports = yield* Reports.Reports;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { stateDir } = yield* ServerConfig.ServerConfig;
    return {
      onProjectDeleted: Effect.fn("AmicitedCloud.onProjectDeleted")(function* (
        projectId: import("@t3tools/contracts").ProjectId,
      ) {
        yield* reports.deleteProject(projectId).pipe(Effect.orDie);
        if (cloud.domains) yield* Effect.promise(() => cloud.domains!.forget(projectId));
        // Resolved per call: the issues layer needs ProjectService, which reads this lifecycle.
        const issues = yield* Effect.serviceOption(AmicitedIssues);
        if (Option.isSome(issues))
          yield* issues.value.forgetProject(projectId).pipe(Effect.ignoreCause({ log: true }));
        yield* fs
          .remove(domainFaviconDirectory(path, stateDir, projectId), { recursive: true })
          .pipe(Effect.ignore);
      }),
    };
  }),
);

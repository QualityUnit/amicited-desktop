import { expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as ServerConfig from "../config.ts";
import * as ExternalLauncher from "../process/externalLauncher.ts";
import * as Cloud from "./Cloud.ts";
import { resolveSiteRuntimeMode } from "./siteRuntimePolicy.ts";

it.effect(
  "keeps decoded site metadata when the membership backup cannot be written and retries on write",
  () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const primary = `${config.stateDir}/amicited-domains.json`;
      const backup = `${config.stateDir}/amicited-site-projects.json`;
      const files = new Map([
        [
          primary,
          JSON.stringify([
            {
              projectId: "site",
              hostname: "example.com",
              brand: "",
              connectionRef: "site",
              siteFiles: "/fixture/site",
            },
          ]),
        ],
      ]);
      let denyBackup = true;
      let denyAfterRegistry = false;
      const fs = FileSystem.makeNoop({
        exists: (path) => Effect.succeed(files.has(path)),
        readFileString: (path) => Effect.sync(() => files.get(path)!),
        writeFileString: (path, value) =>
          path === `${backup}.tmp` && denyBackup
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "writeFileString",
                }),
              )
            : Effect.sync(() => {
                files.set(path, value);
              }),
        rename: (from, to) =>
          Effect.sync(() => {
            files.set(to, files.get(from)!);
            files.delete(from);
            if (to === primary && denyAfterRegistry) denyBackup = true;
          }),
      });
      const cloud = yield* Cloud.AmicitedCloud.pipe(
        Effect.provide(Cloud.layer),
        Effect.provideService(FileSystem.FileSystem, fs),
      );
      expect(yield* resolveSiteRuntimeMode(cloud, "site", "full-access", "/fixture/site")).toBe(
        "approval-required",
      );
      expect(yield* resolveSiteRuntimeMode(cloud, "other", "full-access", "/other")).toBe(
        "full-access",
      );
      expect(files.has(backup)).toBe(false);
      denyBackup = false;
      yield* Effect.promise(() => cloud.domains!.register("site", "example.com", "Updated"));
      expect(JSON.parse(files.get(backup)!)).toEqual([
        { projectId: "site", siteFiles: "/fixture/site" },
      ]);
      expect(JSON.parse(files.get(primary)!)[0].brand).toBe("Updated");
      denyAfterRegistry = true;
      yield* Effect.promise(() => cloud.domains!.register("site", "example.com", "Saved"));
      expect(JSON.parse(files.get(primary)!)[0].brand).toBe("Saved");
    }).pipe(
      Effect.provide(ServerConfig.layerTest(process.cwd(), { prefix: "w42-cloud-" })),
      Effect.provideService(ExternalLauncher.ExternalLauncher, {
        launchBrowser: () => Effect.void,
        launchEditor: () => Effect.void,
        resolveAvailableEditors: () => Effect.succeed([]),
        resolveFileManagerRevealKind: () => Effect.undefined,
      }),
      Effect.provide(NodeServices.layer),
    ),
);

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect.each([
  { isDevelopment: false, name: "amicited" },
  { isDevelopment: true, name: "amicited-dev" },
])("uses AmICited's own profile ($name) and never copies T3 Code's", ({ isDevelopment, name }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "amicited-profile-" });
    const t3State = '{"os_crypt":{"encrypted_key":"t3-key"}}';
    for (const t3Profile of ["t3code-v2", "t3code", "T3 Code (Alpha)", "T3 Code (Dev)"]) {
      yield* fs.makeDirectory(path.join(directory, t3Profile), { recursive: true });
      yield* fs.writeFileString(path.join(directory, t3Profile, "Local State"), t3State);
    }
    for (const platform of ["win32", "darwin", "linux"] as const) {
      const userDataPath = yield* resolveUserDataPath({
        appDataDirectory: directory,
        isDevelopment,
        platform,
      });
      assert.equal(userDataPath, path.join(directory, name));
    }
    assert.isFalse(yield* fs.exists(path.join(directory, name)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

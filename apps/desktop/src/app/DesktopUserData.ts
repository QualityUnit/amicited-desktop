import { ELECTRON_USER_DATA_DIR, ELECTRON_USER_DATA_DIR_DEV } from "@amicited/identity";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Schema from "effect/Schema";

export class DesktopUserDataInitializationError extends Schema.TaggedError<DesktopUserDataInitializationError>()(
  "DesktopUserDataInitializationError",
  {
    operation: Schema.Literals(["inspect", "read", "create-directory", "write"]),
    resourcePath: Schema.String,
    category: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `Could not initialize Electron user data during ${this.operation} at ${this.resourcePath} (${this.category}).`;
  }

  static fromFileSystem(
    cause: PlatformError.PlatformError,
    operation: DesktopUserDataInitializationError["operation"],
    resourcePath: string,
  ) {
    return new DesktopUserDataInitializationError({
      operation,
      resourcePath,
      category: cause.reason._tag,
      cause,
    });
  }
}

export const resolveUserDataPath = Effect.fn("desktop.userData.resolveUserDataPath")(
  function* (input: {
    readonly appDataDirectory: string;
    readonly isDevelopment: boolean;
    readonly platform: NodeJS.Platform;
  }): Effect.fn.Return<string, DesktopUserDataInitializationError, Path.Path> {
    const path = yield* Path.Path;
    // AmICited's own profile, so it never shares Chromium state, safeStorage keys or the
    // single-instance lock with T3 Code, and never copies T3 Code's profiles.
    return path.join(
      input.appDataDirectory,
      input.isDevelopment ? ELECTRON_USER_DATA_DIR_DEV : ELECTRON_USER_DATA_DIR,
    );
  },
);

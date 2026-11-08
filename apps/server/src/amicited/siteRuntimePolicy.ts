import type { CloudClient } from "@amicited/cloud-client";
import type { RuntimeMode } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

class SiteMetadataError extends Schema.TaggedError<SiteMetadataError>()("SiteMetadataError", {
  cause: Schema.Defect(),
}) {}

const warned = new WeakSet<object>();

export const resolveSiteRuntimeMode = Effect.fn("Amicited.resolveSiteRuntimeMode")(function* (
  cloud: Pick<CloudClient, "domains">,
  projectId: string,
  fallback: RuntimeMode,
  cwd: string,
) {
  const rows = yield* Effect.tryPromise({
    try: () => cloud.domains?.metadata() ?? Promise.resolve([]),
    catch: (cause) => new SiteMetadataError({ cause }),
  }).pipe(Effect.catchTags({ SiteMetadataError: () => Effect.succeed(null) }));
  if (rows === null) {
    if (!warned.has(cloud)) {
      warned.add(cloud);
      yield* Effect.logWarning(
        "Domain registry unavailable; using independent site membership for runtime supervision.",
      );
    }
    const site = yield* Effect.promise(
      () => cloud.domains?.requiresSiteApproval(projectId, cwd) ?? Promise.resolve(false),
    );
    return site ? ("approval-required" as const) : fallback;
  }
  return rows.some((row) => row.projectId === projectId && row.siteFiles)
    ? ("approval-required" as const)
    : fallback;
});

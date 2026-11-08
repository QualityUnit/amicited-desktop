import type { CloudClient } from "@amicited/cloud-client";
import type { RuntimeMode } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

class SiteMetadataError extends Schema.TaggedError<SiteMetadataError>()("SiteMetadataError", {
  cause: Schema.Defect(),
}) {}

export const resolveSiteRuntimeMode = Effect.fn("Amicited.resolveSiteRuntimeMode")(function* (
  cloud: Pick<CloudClient, "domains">,
  projectId: string,
  fallback: RuntimeMode,
) {
  const rows = yield* Effect.tryPromise({
    try: () => cloud.domains?.metadata() ?? Promise.resolve([]),
    catch: (cause) => new SiteMetadataError({ cause }),
  }).pipe(Effect.catchTags({ SiteMetadataError: () => Effect.succeed(null) }));
  // Unknown metadata must not let a connected site start without approval.
  if (rows === null) return "approval-required" as const;
  return rows.some((row) => row.projectId === projectId && row.siteFiles)
    ? ("approval-required" as const)
    : fallback;
});

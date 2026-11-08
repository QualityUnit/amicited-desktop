import type { CloudClient } from "@amicited/cloud-client";
import type { RuntimeMode } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AmicitedCloud } from "./Cloud.ts";

export const siteRuntimeMode = Effect.fn("Amicited.siteRuntimeMode")(function* (
  projectId: string,
  fallback: RuntimeMode,
) {
  const cloud = yield* Effect.serviceOption(AmicitedCloud);
  if (Option.isNone(cloud)) return fallback;
  return yield* resolveSiteRuntimeMode(cloud.value, projectId, fallback);
});

export const resolveSiteRuntimeMode = Effect.fn("Amicited.resolveSiteRuntimeMode")(function* (
  cloud: Pick<CloudClient, "domains">,
  projectId: string,
  fallback: RuntimeMode,
) {
  const rows = yield* Effect.promise(() => cloud.domains?.metadata() ?? Promise.resolve([]));
  return rows.some((row) => row.projectId === projectId && row.siteFiles)
    ? ("approval-required" as const)
    : fallback;
});

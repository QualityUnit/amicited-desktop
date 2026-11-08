import { expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { DomainConnections } from "@amicited/cloud-client/domains";
import { resolveSiteRuntimeMode } from "./siteRuntimePolicy.ts";

it.effect("requires approvals for site projects regardless of the caller's selected mode", () =>
  Effect.gen(function* () {
    const domains = new DomainConnections({
      read: async () => [
        {
          projectId: "site",
          hostname: "example.com",
          brand: "",
          connectionRef: "site",
          siteFiles: "/fixture/site",
        },
      ],
      write: async () => {},
      secrets: () => ({
        read: async () => undefined,
        write: async () => {},
        clear: async () => {},
      }),
      legacy: { read: async () => undefined, write: async () => {}, clear: async () => {} },
      client: () => {
        throw new Error("No network expected");
      },
      changed: () => {},
    });
    expect(yield* resolveSiteRuntimeMode({ domains }, "site", "full-access")).toBe(
      "approval-required",
    );
    expect(yield* resolveSiteRuntimeMode({ domains }, "other", "full-access")).toBe("full-access");
  }),
);

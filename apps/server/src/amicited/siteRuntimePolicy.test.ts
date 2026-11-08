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
    expect(yield* resolveSiteRuntimeMode({ domains }, "site", "full-access", "/fixture/site")).toBe(
      "approval-required",
    );
    expect(yield* resolveSiteRuntimeMode({ domains }, "other", "full-access", "/other")).toBe(
      "full-access",
    );
  }),
);

it.effect("limits an unknown registry to independently recorded site folders", () =>
  Effect.gen(function* () {
    for (const known of [false, true]) {
      let membershipReadable = true;
      const domains = new DomainConnections({
        read: async () => {
          throw new Error("Unreadable registry");
        },
        readSiteMembership: async () => {
          if (!known || !membershipReadable) throw new Error("Unreadable membership");
          return [{ projectId: "site", siteFiles: "/fixture/site" }];
        },
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
      const cloud = { domains };
      for (const [project, cwd, expected] of [
        ["site", "/fixture/site", known ? "approval-required" : "full-access"],
        ["worktree", "/fixture/site/branch", known ? "approval-required" : "full-access"],
        ["other", "/fixture/site-unrelated", "full-access"],
        ["developer", "/fixture/projects/developer", "full-access"],
      ] as const) {
        expect(yield* resolveSiteRuntimeMode(cloud, project, "full-access", cwd)).toBe(expected);
        membershipReadable = false;
      }
    }
  }),
);

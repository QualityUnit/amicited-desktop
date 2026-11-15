import { expect } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId, type OrchestrationProjectShell } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as ServerConfig from "../config.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { faviconExtension, make } from "./DomainFavicons.ts";

const bytes = (...values: ReadonlyArray<number>) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

it("names a favicon from its bytes and rejects pages served in its place", () => {
  expect(faviconExtension(PNG)).toBe("png");
  expect(faviconExtension(bytes(0x00, 0x00, 0x01, 0x00, 0x01))).toBe("ico");
  expect(faviconExtension(text('<?xml version="1.0"?>\n<svg xmlns="x"/>'))).toBe("svg");
  expect(faviconExtension(text("<!doctype html><html><body>Not found</body></html>"))).toBe(null);
  expect(faviconExtension(new Uint8Array())).toBe(null);
});

it.effect("applies a domain's live favicon once and keeps the user's later choice", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const requests: Array<string> = [];
    const shells = new Map<string, OrchestrationProjectShell>(
      ["site", "custom"].map((id) => [
        id,
        {
          id: ProjectId.make(id),
          title: `${id}.com`,
          workspaceRoot: `/fixture/${id}`,
          defaultModelSelection: null,
          faviconPath: null,
          projectIcon: id === "custom" ? { kind: "emoji", emoji: "🚀" } : null,
          scripts: [],
          createdAt: "2026-11-15T00:00:00.000Z",
          updatedAt: "2026-11-15T00:00:00.000Z",
        },
      ]),
    );
    const projects = Layer.mock(ProjectService.ProjectService)({
      getShell: (projectId) => Effect.succeed(Option.fromNullishOr(shells.get(projectId))),
      update: (input) =>
        Effect.sync(() => {
          const shell = shells.get(input.projectId)!;
          shells.set(input.projectId, { ...shell, faviconPath: input.faviconPath ?? null });
          return {} as never;
        }),
    } satisfies Partial<ProjectService.ProjectService["Service"]>);
    const http = Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request) =>
        Effect.sync(() => {
          requests.push(request.url);
          return HttpClientResponse.fromWeb(request, new Response(PNG));
        }),
      ),
    );
    const favicons = yield* make.pipe(Effect.provide(Layer.mergeAll(projects, http)));
    const domains = [
      { projectId: "site", hostname: "site.com" },
      { projectId: "custom", hostname: "custom.com" },
    ];

    yield* favicons.sync(domains);
    const applied = shells.get("site")!.faviconPath!;
    expect(applied).toMatch(/amicited-favicons\/site\/site\.com\.png$/);
    expect([...(yield* fs.readFile(applied))]).toEqual([...PNG]);
    expect(shells.get("custom")!.faviconPath).toBe(null);
    expect(requests).toEqual(["https://site.com/favicon.ico"]);

    // Resetting to Automatic in project settings must not bring the icon back.
    shells.set("site", { ...shells.get("site")!, faviconPath: null });
    yield* favicons.sync(domains);
    expect(shells.get("site")!.faviconPath).toBe(null);
    expect(requests).toHaveLength(1);
  }).pipe(
    Effect.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "domain-favicons-" }).pipe(
        Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
      ),
    ),
  ),
);

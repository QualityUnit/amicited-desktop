import { publicAddresses } from "../htmlRender/publicProxy.ts";
import type { QueryFetcher } from "@amicited/reports/query";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServerConfig from "../config.ts";
import { domainFaviconDirectory, faviconExtension } from "./DomainFavicons.ts";
import * as NodeModule from "node:module";
import type * as Undici from "undici";
import * as Clock from "effect/Clock";
import * as Schema from "effect/Schema";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ReportFailure } from "@amicited/reports/rpc";
import { normalizeDomain } from "@amicited/cloud-client/domainModel";
import { AmicitedCloud } from "./Cloud.ts";

const isReportFailure = Schema.is(ReportFailure);

// undici is external to the CLI bundle; a single executable can load it from disk only with require.
const requireUndici = NodeModule.createRequire(import.meta.url);
const undici = () => requireUndici("undici") as typeof Undici;
const restFetch: typeof Undici.fetch = (input, init) => undici().fetch(input, init);

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
export class ReportsApi extends Context.Service<
  ReportsApi,
  {
    readonly branding: (
      projectId: string,
      logo?: string,
    ) => Effect.Effect<{ domain: string; logoDataUrl?: string }>;
    readonly connection: (
      projectId: string,
    ) => Effect.Effect<{ domain: string; workspaceId: string; domainId: string }, ReportFailure>;
    readonly fetcher: (projectId: string) => Effect.Effect<QueryFetcher, ReportFailure>;
    readonly get: (
      projectId: string,
      path: string,
      params: Record<string, string | number | boolean>,
      signal?: AbortSignal,
    ) => Effect.Effect<unknown, ReportFailure>;
    readonly catalog: (
      action: "search" | "describe",
      query: string,
    ) => Effect.Effect<unknown, ReportFailure>;
  }
>()("t3/amicited/ReportsApi") {}

export const layer = Layer.effect(
  ReportsApi,
  Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const cloud = yield* AmicitedCloud;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { stateDir } = yield* ServerConfig.ServerConfig;
    const base = yield* Config.String("T3CODE_DEV_AMICITED_REST_URL").pipe(
      Config.withDefault("https://api.flowhunt.io"),
    );
    const cache = new Map<
      string,
      { workspaceId: string; domainId: string; domain: string; expires: number }
    >();
    const request = async (
      projectId: string,
      path: string,
      params: Record<string, string | number | boolean>,
      signal?: AbortSignal,
    ) => {
      const headers = await cloud.forProject(projectId).restHeaders();
      if (!headers["Api-Key"])
        throw new ReportFailure({
          message: "Reports need an AmICited API key connected to this domain.",
        });
      const url = new URL(path, base);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
      const response = await restFetch(url, {
        headers,
        redirect: "error",
        signal: AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty response");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (!response.ok && size > 2000) {
            chunks.push(next.value.subarray(0, Math.max(0, 2000 - (size - next.value.byteLength))));
            break;
          }
          if (size > 5 * 1024 * 1024) throw new Error("Response too large");
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel();
      }
      // Never propagate credential echoes from a misconfigured upstream into reports or tools.
      const body = Buffer.concat(chunks)
        .toString("utf8")
        .split(headers["Api-Key"])
        .join("[redacted]");
      if (!response.ok)
        throw new ReportFailure({
          message: `Report API returned HTTP ${response.status}: ${body.slice(0, 2000)}`,
        });
      return JSON.parse(body) as unknown;
    };
    const connection = Effect.fn("ReportsApi.connection")(function* (projectId: string) {
      return yield* Effect.tryPromise({
        try: async () => {
          const domains = (await cloud.domains?.list()) ?? [];
          const domain = domains.find((d) => d.projectId === projectId);
          if (!domain)
            throw new ReportFailure({ message: "This report’s domain could not be found." });
          const headers = await cloud.forProject(projectId).restHeaders();
          if (!headers["Api-Key"])
            throw new ReportFailure({
              message: "Reports need an AmICited API key connected to this domain.",
            });
          const cacheKey = `${projectId}\0${headers["Api-Key"]}`;
          const cached = cache.get(cacheKey);
          if (
            cached &&
            cached.expires > clock.currentTimeMillisUnsafe() &&
            cached.domain === domain.hostname
          )
            return cached;
          const me = record(await request(projectId, "/v2/auth/me", {}));
          const workspaceId = me.api_key_workspace_id;
          if (typeof workspaceId !== "string")
            throw new ReportFailure({
              message: "The connected API key did not return a workspace.",
            });
          let domainId = domain.domainId;
          if (!domainId) {
            const response = await request(projectId, "/v2/amicited/domains", {
              workspace_id: workspaceId,
            });
            const rows = Array.isArray(response)
              ? response
              : (record(response).items ?? record(response).domains ?? []);
            const match = (Array.isArray(rows) ? rows : [])
              .map(record)
              .find(
                (row) =>
                  normalizeDomain(
                    String(row.domain_name ?? row.domain ?? row.hostname ?? row.name ?? ""),
                  ).hostname === normalizeDomain(domain.hostname).hostname,
              );
            domainId =
              typeof match?.id === "string"
                ? match.id
                : typeof match?.domain_id === "string"
                  ? match.domain_id
                  : undefined;
          }
          if (!domainId)
            throw new ReportFailure({
              message: "This domain was not found in the connected AmICited workspace.",
            });
          const result = {
            domain: domain.hostname,
            domainId,
            workspaceId,
            expires: clock.currentTimeMillisUnsafe() + 600000,
          };
          if (cache.size > 100) cache.clear();
          cache.set(cacheKey, result);
          return result;
        },
        catch: (error) =>
          isReportFailure(error)
            ? error
            : new ReportFailure({
                message:
                  "Could not reach AmICited to resolve this domain. Check your connection and try again.",
              }),
      });
    });
    let document: { value: Record<string, unknown>; expires: number } | undefined;
    let loading: Promise<Record<string, unknown>> | undefined;
    const loadCatalog = async () => {
      if (document && document.expires > clock.currentTimeMillisUnsafe()) return document.value;
      loading ??= (async () => {
        const response = await restFetch(new URL("/openapi.json", base), {
          signal: AbortSignal.timeout(30000),
          redirect: "error",
        });
        if (!response.ok)
          throw new ReportFailure({
            message: "Report API catalog is unavailable; no queries were sent.",
          });
        const value = record(await response.json());
        document = { value, expires: clock.currentTimeMillisUnsafe() + 86400000 };
        return value;
      })();
      try {
        return await loading;
      } finally {
        loading = undefined;
      }
    };
    const resolveRef = (value: unknown, doc: Record<string, unknown>): Record<string, unknown> => {
      const row = record(value);
      return typeof row.$ref === "string" && row.$ref.startsWith("#/")
        ? record(
            row.$ref
              .slice(2)
              .split("/")
              .reduce<unknown>((v, k) => record(v)[k], doc),
          )
        : row;
    };
    const operation = (doc: Record<string, unknown>, path: string) => {
      const item = record(record(doc.paths)[path]);
      const get = record(item.get);
      const parameters = [
        ...(Array.isArray(item.parameters) ? item.parameters : []),
        ...(Array.isArray(get.parameters) ? get.parameters : []),
      ].map((p) => resolveRef(p, doc));
      if (
        !/^\/v2\/amicited\/[a-z0-9_\-/]+$/.test(path) ||
        !item.get ||
        parameters.some((p) => p.in === "path") ||
        !parameters.some((p) => p.in === "query" && p.name === "domain_id")
      )
        throw new ReportFailure({
          message: "This endpoint is not a domain-scoped report GET operation.",
        });
      return get;
    };
    const rejectSelectors = (params: Record<string, string | number | boolean>) => {
      const selector = Object.keys(params).find((k) => /domain|workspace/i.test(k));
      if (selector)
        throw new ReportFailure({
          message: `Query parameter ${selector} is not allowed; domain and workspace selectors are injected.`,
        });
    };
    const fetcher = Effect.fn("ReportsApi.fetcher")(function* (projectId: string) {
      const ids = yield* connection(projectId);
      return (async (path, params, signal) => {
        const doc = await loadCatalog();
        operation(doc, path);
        const { workspace_id: _workspace, domain_id: _domain, ...rest } = params;
        rejectSelectors(rest);
        try {
          return await request(
            projectId,
            path,
            { ...rest, workspace_id: ids.workspaceId, domain_id: ids.domainId },
            signal,
          );
        } catch (error) {
          throw isReportFailure(error)
            ? error
            : new ReportFailure({
                message: "Report data is unavailable. Check your connection and try again.",
              });
        }
      }) satisfies QueryFetcher;
    });
    const get = Effect.fn("ReportsApi.get")(function* (
      projectId: string,
      path: string,
      params: Record<string, string | number | boolean>,
      signal?: AbortSignal,
    ) {
      yield* Effect.try({
        try: () => rejectSelectors(params),
        catch: (error) =>
          isReportFailure(error)
            ? error
            : new ReportFailure({ message: "Invalid report parameters." }),
      });
      const fetch = yield* fetcher(projectId);
      return yield* Effect.tryPromise({
        try: () => fetch(path, params, signal ?? AbortSignal.timeout(30000)),
        catch: (error) =>
          isReportFailure(error)
            ? error
            : new ReportFailure({
                message: "Report API catalog is unavailable; no queries were sent.",
              }),
      });
    });
    const catalog = Effect.fn("ReportsApi.catalog")(function* (
      action: "search" | "describe",
      query: string,
    ) {
      return yield* Effect.tryPromise({
        try: async () => {
          const doc = await loadCatalog();
          const paths = Object.entries(record(doc.paths)).filter(([path]) => {
            try {
              operation(doc, path);
              return true;
            } catch {
              return false;
            }
          });
          if (action === "search")
            return paths
              .filter(([path, value]) =>
                `${path} ${encodeJson(record(value).get)}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .slice(0, 40)
              .map(([path, value]) => ({ path, summary: record(record(value).get).summary }));
          const get = operation(doc, query);
          const expand = (value: unknown, depth: number): unknown => {
            if (depth > 9) return { truncated: true };
            if (Array.isArray(value)) return value.map((v) => expand(v, depth + 1));
            if (value && typeof value === "object")
              return Object.fromEntries(
                Object.entries(resolveRef(value, doc)).map(([k, v]) => [k, expand(v, depth + 1)]),
              );
            return value;
          };
          return expand(get, 0);
        },
        catch: (error) =>
          isReportFailure(error)
            ? error
            : new ReportFailure({ message: "Report API catalog is unavailable." }),
      });
    });
    const branding = Effect.fn("ReportsApi.branding")(function* (projectId: string, logo?: string) {
      const domains = yield* Effect.promise(() => cloud.domains?.list() ?? Promise.resolve([]));
      const domain = domains.find((d) => d.projectId === projectId)?.hostname ?? "";
      if (logo !== "domain") {
        if (logo?.startsWith("data:")) {
          if (logo.length > 350 * 1024) return { domain };
          const embedded = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
            logo,
          );
          if (!embedded) return { domain };
          const bytes = Buffer.from(embedded[2]!, "base64");
          const extension = embedded[1] === "jpeg" ? "jpg" : embedded[1];
          if (
            bytes.length > 256 * 1024 ||
            bytes.toString("base64") !== embedded[2] ||
            faviconExtension(bytes) !== extension
          )
            return { domain };
          return { domain, logoDataUrl: logo };
        }
        if (!logo?.startsWith("https://")) return { domain };
        const logoDataUrl = yield* Effect.tryPromise({
          try: async () => {
            const url = new URL(logo);
            const addresses = await publicAddresses(url.hostname.replace(/^\[|\]$/g, ""));
            if (!addresses) return undefined;
            const dispatcher = new (undici().Agent)({
              connect: {
                lookup: (_host, options, callback) =>
                  options.all
                    ? callback(null, addresses)
                    : callback(null, addresses[0]!.address, addresses[0]!.family),
              },
            });
            try {
              const response = await restFetch(url, {
                dispatcher,
                redirect: "error",
                signal: AbortSignal.timeout(10000),
              });
              if (!response.ok) return undefined;
              const reader = response.body?.getReader();
              if (!reader) return undefined;
              const chunks: Uint8Array[] = [];
              let size = 0;
              try {
                for (;;) {
                  const chunk = await reader.read();
                  if (chunk.done) break;
                  size += chunk.value.byteLength;
                  if (size > 256 * 1024) return undefined;
                  chunks.push(chunk.value);
                }
              } finally {
                await reader.cancel();
              }
              const bytes = Buffer.concat(chunks);
              const extension = faviconExtension(bytes);
              const mime =
                extension === "ico"
                  ? "x-icon"
                  : extension === "svg"
                    ? "svg+xml"
                    : extension === "jpg"
                      ? "jpeg"
                      : extension;
              return mime ? `data:image/${mime};base64,${bytes.toString("base64")}` : undefined;
            } finally {
              await dispatcher.close();
            }
          },
          catch: () => new ReportFailure({ message: "Report logo is unavailable." }),
        }).pipe(Effect.orElseSucceed(() => undefined));
        return { domain, ...(logoDataUrl ? { logoDataUrl } : {}) };
      }
      if (!/^[\w-]+$/.test(projectId)) return { domain };
      const directory = domainFaviconDirectory(path, stateDir, projectId);
      const files = yield* fs
        .readDirectory(directory)
        .pipe(Effect.orElseSucceed((): readonly string[] => []));
      const file = files.find((f) => f.startsWith(`${domain}.`));
      if (!file) return { domain };
      const bytes = yield* fs
        .readFile(path.join(directory, file))
        .pipe(Effect.orElseSucceed(() => new Uint8Array()));
      if (!bytes.length || bytes.length > 256 * 1024) return { domain };
      const mime = file.endsWith(".svg")
        ? "image/svg+xml"
        : file.endsWith(".ico")
          ? "image/x-icon"
          : file.endsWith(".jpg")
            ? "image/jpeg"
            : `image/${file.split(".").at(-1)}`;
      return {
        domain,
        logoDataUrl: `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`,
      };
    });
    return { connection, fetcher, get, catalog, branding };
  }),
);

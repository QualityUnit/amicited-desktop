import { evaluate, interpolate, expressionError, type ExpressionContext } from "./expressions.ts";
import { decodeReportSpec, type ReportSpec } from "./spec.ts";
export interface QueryContext extends ExpressionContext {
  workspaceId: string;
  domainId: string;
}
export interface ResolvedQuery {
  id: string;
  path: string;
  params: Record<string, string | number | boolean>;
  parse?: string;
  error?: string;
  context: ExpressionContext;
}
export async function resolveQueries(
  spec: ReportSpec,
  context: QueryContext,
): Promise<ResolvedQuery[]> {
  decodeReportSpec(spec);
  return Promise.all(
    Object.entries(spec.queries).map(async ([id, query]) => {
      const params: ResolvedQuery["params"] = {};
      try {
        for (const [key, value] of Object.entries(query.params ?? {})) {
          if (/domain|workspace/i.test(key))
            throw new Error(
              `Query parameter ${key} is not allowed; domain and workspace selectors are injected`,
            );
          const resolved =
            typeof value === "string" ? await interpolate(value, {}, context) : value;
          if (resolved !== "") params[key] = resolved;
        }
      } catch (error) {
        return { id, path: query.path, params, context, error: expressionError(error) };
      }
      params.workspace_id = context.workspaceId;
      params.domain_id = context.domainId;
      return {
        id,
        path: query.path,
        params,
        ...(query.parse === undefined ? {} : { parse: query.parse }),
        context,
      };
    }),
  );
}
export type QueryFetcher = (
  path: string,
  params: ResolvedQuery["params"],
  signal: AbortSignal,
) => Promise<unknown>;
export interface QueryOptions {
  timeoutMs?: number;
  maxBytes?: number;
  responseSize?: (response: unknown) => number;
}
export async function runQueries(
  requests: readonly ResolvedQuery[],
  fetcher: QueryFetcher,
  options: QueryOptions = {},
): Promise<{ datasets: Record<string, unknown>; errors: Record<string, string> }> {
  if (requests.length > 30) throw new Error("queries: at most 30 queries are allowed");
  const datasets: Record<string, unknown> = Object.create(null);
  const errors: Record<string, string> = Object.create(null);
  let index = 0;
  async function run() {
    while (index < requests.length) {
      const request = requests[index++]!;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (request.error) throw new Error(request.error);
        if (
          !/^\/v2\/amicited\/[a-z0-9_\-/]+$/.test(request.path) ||
          request.path.split("/").some((s) => s === "..")
        )
          throw new Error("Query path is not allowed");
        const response = await Promise.race([
          fetcher(request.path, request.params, controller.signal),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error("Query timed out"));
            }, options.timeoutMs ?? 30000);
          }),
        ]);
        const serializedSize = Buffer.byteLength(JSON.stringify(response) ?? "");
        const size = options.responseSize?.(response) ?? serializedSize;
        if (
          !Number.isFinite(size) ||
          size < 0 ||
          Math.max(size, serializedSize) > (options.maxBytes ?? 5 * 1024 * 1024)
        )
          throw new Error("Query response exceeds size limit");
        datasets[request.id] = request.parse
          ? await evaluate(request.parse, response, request.context)
          : response;
      } catch (error) {
        errors[request.id] = expressionError(error);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, requests.length) }, run));
  return { datasets, errors };
}

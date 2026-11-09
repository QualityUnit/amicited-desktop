import * as Schema from "effect/Schema";
import type { ToolDefinition } from "@amicited/tools-core";

export const urlSchema = Schema.String.check(Schema.isPattern(/^https?:\/\//i));
export const urlInput = Schema.Struct({
  url: urlSchema.annotate({ title: "Page URL", description: "The page you want to check." }),
});
export const findingSchema = Schema.Struct({
  title: Schema.String,
  status: Schema.Literals(["pass", "warn", "fail", "unknown"]),
  why: Schema.String,
  fix: Schema.String,
});
export type Finding = typeof findingSchema.Type;
export const checkOutput = Schema.Struct({
  status: Schema.Literals(["checked", "could_not_check"]),
  score: Schema.NullOr(Schema.Number),
  findings: Schema.Array(findingSchema),
  details: Schema.Unknown,
});
export const finding = (
  title: string,
  good: boolean,
  why: string,
  fix: string,
  warning = false,
): Finding => ({
  title,
  status: good ? "pass" : warning ? "warn" : "fail",
  why,
  fix: good ? "" : fix,
});
export function checked(findings: readonly Finding[], details: unknown = {}) {
  const known = findings.filter((f) => f.status !== "unknown");
  return {
    status: "checked" as const,
    score: known.length
      ? Math.round(
          (known.reduce(
            (n, f) => n + (f.status === "pass" ? 1 : f.status === "warn" ? 0.5 : 0),
            0,
          ) /
            known.length) *
            100,
        )
      : null,
    findings,
    details,
  };
}
export function unavailable(message = "Could not check. Check the address and your connection.") {
  return {
    status: "could_not_check" as const,
    score: null,
    findings: [
      {
        title: message,
        status: "unknown" as const,
        why: "No reliable result was received.",
        fix: "Try again when the website is reachable.",
      },
    ],
    details: {},
  };
}
export class NotFoundError extends Error {}
export type Fetcher = typeof fetch;
export async function get(url: string, signal: AbortSignal, fetcher: Fetcher = fetch) {
  const target = new URL(url);
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("Use a website address");
  const response = await fetcher(target, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AmICitedDesktop/1.0)",
      Accept: "text/html,application/xml,text/plain,application/json",
    },
  });
  if (response.status === 404 || response.status === 410)
    throw new NotFoundError(`Missing: ${target.pathname}`);
  if (!response.ok) throw new Error(`Website returned ${response.status}`);
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error("Page is too large");
  return text;
}
export function define<I, O>(
  name: string,
  title: string,
  description: string,
  input: Schema.Codec<I>,
  output: Schema.Codec<O>,
  run: ToolDefinition<I, O>["run"],
  keywords: string[] = [],
): ToolDefinition<I, O> {
  return {
    name,
    title,
    description,
    input,
    output,
    run,
    keywords,
    pack: name.startsWith("ai.") ? "ai-visibility" : name.split(".")[0]!,
    cost: "free",
    timeoutMs: 120_000,
    schedulable: true,
    sideEffects: "none",
  };
}
export const plain = (html: string) =>
  html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
export function attrs(tag: string) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map((m) => [
      m[1]!.toLowerCase(),
      m[2] ?? m[3] ?? m[4] ?? "",
    ]),
  );
}

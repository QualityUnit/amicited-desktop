import * as Schema from "effect/Schema";
import { attrs, define, get, plain, type Fetcher } from "../common.ts";
const input = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1)),
  locale: Schema.optional(Schema.String),
  country: Schema.optional(Schema.String),
});
export function parseSerp(html: string) {
  if (/g-recaptcha|unusual traffic|\/sorry\/|id=["']captcha/i.test(html))
    return {
      status: "verification_required" as const,
      message: "Google asked for verification; open in Browser to continue.",
      organic: [],
      aiOverview: { present: null, citations: [] },
      peopleAlsoAsk: [],
    };
  if (/consent\.google|before you continue to Google|name=["']set_eom/i.test(html))
    return {
      status: "consent_required" as const,
      message: "Google asked for consent; open in Browser to continue.",
      organic: [],
      aiOverview: { present: null, citations: [] },
      peopleAlsoAsk: [],
    };
  const organic: { title: string; url: string }[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const title = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(match[2]!);
    if (!title) continue;
    let href = attrs(match[1]!).href ?? "";
    if (href.startsWith("/url?"))
      href =
        new URL(href.replace(/&amp;/g, "&"), "https://www.google.com").searchParams.get("q") ?? "";
    if (/^https?:/.test(href) && !organic.some((r) => r.url === href))
      organic.push({ title: plain(title[1]!), url: href });
  }
  const overview = /AI Overview/i.exec(html);
  // Only attribute links inside an explicitly labeled overview container.
  const overviewBlock =
    /<([a-z]+)\b[^>]*aria-label=["']AI Overview["'][^>]*>([\s\S]*?)<\/\1>/i.exec(html)?.[2] ?? "";
  const citations = [...overviewBlock.matchAll(/href=["'](https?:\/\/[^"']+)/g)].map((m) => m[1]!);
  const peopleAlsoAsk = [...html.matchAll(/data-q=["']([^"']+)["']/g)].map((m) => plain(m[1]!));
  return {
    status: organic.length ? ("checked" as const) : ("could_not_parse" as const),
    message: organic.length
      ? "Results from this machine. Google layout and location can change results."
      : "Could not read Google's results. Open in Browser to inspect the page.",
    organic,
    aiOverview: { present: organic.length ? Boolean(overview) : null, citations },
    peopleAlsoAsk: [...new Set(peopleAlsoAsk)],
  };
}
export function serpTools(fetcher: Fetcher = fetch) {
  const autocomplete = define(
    "serp.autocomplete",
    "Keyword ideas",
    "Get Google autocomplete suggestions, optionally expanding A–Z.",
    Schema.Struct({ ...input.fields, alphabet: Schema.optional(Schema.Boolean) }),
    Schema.Struct({
      status: Schema.Literals(["checked", "partial", "could_not_check"]),
      suggestions: Schema.Array(Schema.String),
      failedQueries: Schema.Array(Schema.String),
    }),
    async (value, { signal }) => {
      const queries = [
        value.query,
        ...(value.alphabet
          ? [..."abcdefghijklmnopqrstuvwxyz"].map((letter) => `${value.query} ${letter}`)
          : []),
      ];
      const suggestions = new Set<string>(),
        failedQueries: string[] = [];
      // Bound concurrency rather than flooding Google with alphabet requests.
      for (let i = 0; i < queries.length; i += 3)
        await Promise.all(
          queries.slice(i, i + 3).map(async (query) => {
            const url = new URL("https://suggestqueries.google.com/complete/search");
            url.search = new URLSearchParams({
              client: "firefox",
              q: query,
              hl: value.locale ?? "en",
              gl: value.country ?? "us",
            }).toString();
            try {
              const parsed: unknown = JSON.parse(await get(url.href, signal, fetcher));
              if (
                !Array.isArray(parsed) ||
                !Array.isArray(parsed[1]) ||
                !parsed[1].every((s) => typeof s === "string")
              )
                throw new Error("Unexpected suggestions");
              parsed[1].forEach((s) => suggestions.add(s as string));
            } catch {
              failedQueries.push(query);
            }
          }),
        );
      return {
        status:
          failedQueries.length === queries.length
            ? ("could_not_check" as const)
            : failedQueries.length
              ? ("partial" as const)
              : ("checked" as const),
        suggestions: [...suggestions],
        failedQueries,
      };
    },
    ["keywords", "suggest", "Google"],
  );
  const serpOutput = Schema.Struct({
    status: Schema.Literals([
      "checked",
      "verification_required",
      "consent_required",
      "could_not_parse",
      "could_not_check",
    ]),
    message: Schema.String,
    organic: Schema.Array(Schema.Struct({ title: Schema.String, url: Schema.String })),
    aiOverview: Schema.Struct({
      present: Schema.NullOr(Schema.Boolean),
      citations: Schema.Array(Schema.String),
    }),
    peopleAlsoAsk: Schema.Array(Schema.String),
  });
  const results = define(
    "serp.fetch",
    "Google search results",
    "Read organic results, AI Overview presence and related buyer questions.",
    input,
    serpOutput,
    async (value, { signal }) => {
      const url = new URL("https://www.google.com/search");
      url.search = new URLSearchParams({
        q: value.query,
        hl: value.locale ?? "en",
        gl: value.country ?? "us",
      }).toString();
      try {
        return parseSerp(await get(url.href, signal, fetcher));
      } catch {
        return {
          status: "could_not_check" as const,
          message: "Could not reach Google. Try again or open in Browser.",
          organic: [],
          aiOverview: { present: null, citations: [] },
          peopleAlsoAsk: [],
        };
      }
    },
    ["SERP", "Google", "AI Overview", "People Also Ask"],
  );
  return { autocomplete, results };
}

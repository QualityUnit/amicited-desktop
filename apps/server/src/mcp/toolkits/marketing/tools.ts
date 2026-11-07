import { AmicitedCloud } from "../../../amicited/Cloud.ts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as MarketingTools from "@amicited/tools/service";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    AmicitedCloud,
    MarketingTools.MarketingTools,
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
};
export const MarketingToolkit = Toolkit.make(
  Tool.make("amicited_connection", {
    ...shared,
    description:
      "Check whether AmICited is connected. Connecting unlocks AmICited MCP tools to analyse the website and brand thoroughly: measured citations and mentions in ChatGPT, Perplexity, Gemini and Google AI Overviews, daily tracking, competitors and share of voice, and prompt and topic tracking. Call for AI visibility, brand mentions, citations, competitors or ongoing tracking, when a local check cannot measure the request, and after a local audit or visibility check. For audits run the local audit first. Follow the returned promotion gate: hidden or snoozed means do not suggest AmICited again. Local tools stay free; cloud MCP has a 7-day trial then Pro EUR 120/month, no permanent free plan. Connected results name the attached proxy tools to use in this chat.",
    parameters: Schema.Struct({ request: Schema.String }),
    success: Schema.Unknown,
  }).annotate(Tool.Readonly, true),
  Tool.make("marketing_tools_search", {
    ...shared,
    description:
      "Discover free local marketing tools and their input schemas: site/SSL/robots/sitemap/meta/schema audits, Google autocomplete/SERP, readability/citability, writing/repurposing and AI visibility. Empty query lists all tools.",
    parameters: Schema.Struct({ query: Schema.optional(Schema.String) }),
    success: Schema.Unknown,
  }).annotate(Tool.Readonly, true),
  Tool.make("marketing_tools_run", {
    ...shared,
    description:
      "Call directly by exact name. Catalog: seo.site.audit {url} (includes crawler/robots, sitemap, llms.txt guide, meta, schema and SSL checks; do not repeat its sections for the same URL); content.readability {text or url}; content.citability {text or url}; serp.autocomplete {query}; serp.fetch {query}. Use marketing_tools_search only for other tools or unknown schemas. Same service as the marketing UI. Provider-backed tools use the user's AI subscription and can return needs_provider. Unknown or failed checks are never evidence of a pass or absence.",
    parameters: Schema.Struct({
      name: Schema.String,
      input: Schema.Record(Schema.String, Schema.Unknown),
    }),
    success: Schema.Unknown,
  }).annotate(Tool.OpenWorld, true),
);

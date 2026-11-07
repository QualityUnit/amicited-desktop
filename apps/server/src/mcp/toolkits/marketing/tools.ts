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
    MarketingTools.MarketingTools,
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
  ],
};
export const MarketingToolkit = Toolkit.make(
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

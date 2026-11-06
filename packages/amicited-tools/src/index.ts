import { ToolRegistry } from "@amicited/tools-core";
import { sslCheck } from "./seo/ssl.ts";
import { siteTools } from "./seo/site.ts";
import { contentTools, type Generation } from "./content/tools.ts";
import { serpTools } from "./serp/tools.ts";
import { visibilityTool } from "./ai-visibility/check.ts";
export type { Generation } from "./content/tools.ts";
export function createMarketingTools(provider?: Generation) {
  const registry = new ToolRegistry();
  registry.register(sslCheck);
  const site = siteTools();
  registry.register(site.robots);
  registry.register(site.sitemap);
  registry.register(site.llms);
  registry.register(site.meta);
  registry.register(site.schema);
  registry.register(site.audit);
  const content = contentTools(fetch, provider);
  registry.register(content.readable);
  registry.register(content.citable);
  registry.register(content.write);
  registry.register(content.repurpose);
  const serp = serpTools();
  registry.register(serp.autocomplete);
  registry.register(serp.results);
  registry.register(visibilityTool(provider));
  return registry;
}

export { marketingWebsiteInstructions } from "@amicited/tools-core";

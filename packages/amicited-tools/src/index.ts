import { ToolRegistry } from "@amicited/tools-core";
import { sslCheck } from "./seo/ssl.ts";
export function createMarketingTools() {
  const registry = new ToolRegistry();
  registry.register(sslCheck);
  return registry;
}

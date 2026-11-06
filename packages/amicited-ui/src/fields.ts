import type { ToolCard } from "@amicited/tools-core";
import { readBrand } from "./experience.js";
export interface FieldSchema {
  type?: string;
  title?: string;
  description?: string;
  pattern?: string;
  anyOf?: FieldSchema[];
}
export function resolveField(schema: FieldSchema): FieldSchema {
  return { ...schema, ...schema.anyOf?.find((branch) => branch.type !== "null") };
}
export function serializeFields(
  properties: Record<string, FieldSchema>,
  required: string[],
  values: Record<string, string>,
) {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => required.includes(key) || Boolean(values[key]?.trim()))
      .map(([key, raw]) => {
        const schema = resolveField(raw);
        const value = values[key] ?? "";
        return [
          key,
          schema.type === "array"
            ? value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            : schema.type === "boolean"
              ? value === "true"
              : ["number", "integer"].includes(schema.type ?? "")
                ? Number(value)
                : value,
        ];
      }),
  );
}
export function initialFields(tool: ToolCard) {
  const key = "amicited.inputs." + tool.name;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved) return JSON.parse(saved) as Record<string, string>;
  } catch {
    /* Storage may be unavailable. */
  }
  const brand = readBrand();
  return brand
    ? {
        brand: brand.name,
        website: brand.website,
        url: brand.website,
        domain: new URL(brand.website).hostname,
      }
    : {};
}
export const fieldLabels: Record<string, string> = {
  brand: "Brand name",
  website: "Website URL",
  url: "Page URL",
  domain: "Website domain",
  category: "What do you sell?",
  market: "Target market (optional)",
  competitors: "Competitors (comma-separated)",
  text: "Source text",
  brief: "What should we write?",
  query: "Search term",
  alphabet: "Include A–Z suggestions",
};

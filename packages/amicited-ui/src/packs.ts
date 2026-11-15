export const packs = [
  ["seo", "Site audit basics"],
  ["ai-visibility", "AI visibility"],
  ["content", "Content tools"],
  ["serp", "Search & keywords"],
] as const;
export function activeToolPack(path: string, hash = "") {
  if (path === "/tools")
    return packs.find(([pack]) => pack === hash.replace(/^#/, ""))?.[0] ?? "seo";
  const tool = path.startsWith("/tools/") ? path.slice(7) : "";
  return tool.startsWith("ai.")
    ? "ai-visibility"
    : packs.find(([pack]) => tool.startsWith(pack + "."))?.[0];
}

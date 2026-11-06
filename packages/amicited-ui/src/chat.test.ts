import { expect, it } from "vite-plus/test";
import { marketingToolResult } from "./chat.js";
it("decodes direct and MCP text results without accepting partial or unrelated output", () => {
  const result = {
    id: "audit",
    tool: "seo.site.audit",
    input: { url: "https://example.com" },
    startedAt: "2026-11-06",
    durationMs: 1,
    status: "success",
    output: { score: 41 },
  };
  for (const value of [
    result,
    JSON.stringify(result),
    { result },
    { structuredContent: result },
    [{ type: "text", text: JSON.stringify(result) }],
    { content: [{ type: "text", text: JSON.stringify(result) }] },
  ])
    expect(marketingToolResult(value)).toEqual(result);
  for (const value of [
    null,
    "pending",
    {},
    { tool: "seo.site.audit" },
    { content: [{ text: "Could not check" }] },
  ])
    expect(marketingToolResult(value)).toBeNull();
  expect(
    marketingToolResult({
      ...result,
      status: "error",
      output: undefined,
      error: { code: "timeout", message: "Could not check" },
    })?.status,
  ).toBe("error");
});

import { expect, it } from "vite-plus/test";
import { marketingToolResult, marketingCallState } from "./chat.js";
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

it("ends undecodable or plain MCP failures instead of leaving a pending card", () => {
  expect(
    marketingCallState("completed", { content: [{ text: "Access denied" }], isError: true }),
  ).toBe("failed");
  expect(marketingCallState("failed", "Timeout")).toBe("failed");
  expect(marketingCallState("cancelled", undefined)).toBe("cancelled");
  expect(marketingCallState("inProgress", undefined)).toBe("pending");
});

it("maps sign-in failures and preserves the MCP failure reason", async () => {
  const { marketingSignInError, marketingErrorText } = await import("./chat.js");
  expect(marketingSignInError("Claude could not authenticate. Run claude auth login")).toBe(true);
  expect(marketingSignInError("The website did not respond")).toBe(false);
  expect(
    marketingErrorText({
      isError: true,
      content: [{ type: "text", text: "The website did not respond" }],
    }),
  ).toBe("The website did not respond");
});

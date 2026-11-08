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
    { content: JSON.stringify(result) },
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

it("uses the shared work disclosure for pending and failed calls", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MarketingUiContext } = await import("./primitives.js");
  const { MarketingCallState } = await import("./chat.js");
  for (const [status, expected, pending] of [
    ["inProgress", "Running website health audit on example.com…", true],
    ["failed", "Couldn't check website health audit on example.com", false],
  ] as const) {
    const labels: unknown[] = [];
    const markup = renderToStaticMarkup(
      createElement(
        MarketingUiContext,
        {
          value: {
            Button: (props) => createElement("button", props),
            Input: (props) => createElement("input", props),
            Textarea: (props) => createElement("textarea", props),
            WorkDisclosure: (props) => {
              labels.push([props.label, props.pending]);
              return createElement("section", { "data-shared-disclosure": true }, props.children);
            },
          },
        },
        createElement(MarketingCallState, {
          status,
          input: { name: "seo.site.audit", input: { url: "https://example.com" } },
          output: "The website did not respond.",
        }),
      ),
    );
    expect(labels[0]).toEqual([expected, pending]);
    expect(markup).toContain('data-shared-disclosure="true"');
    if (!pending) expect(markup).toContain("The website did not respond.");
  }
});

it("summarizes provider results and query fan-out without inventing failed measurements", async () => {
  const { cloudSummary } = await import("./chat.tsx");
  expect(
    cloudSummary({
      providers: [
        { provider: "chatgpt", status: "success", mentioned: true, visibility_score: 74 },
        { provider: "perplexity", status: "success", mentioned: true, visibility_score: 50 },
        { provider: "gemini", status: "failure", mentioned: null, visibility_score: null },
      ],
    }),
  ).toBe(
    "Mentioned by ChatGPT and Perplexity · Could not check Gemini · Average visibility 62/100",
  );
  expect(
    cloudSummary({
      providers: ["chatgpt", "gemini", "deepseek"].map((provider) => ({
        provider,
        status: "success",
        mentioned: true,
      })),
    }),
  ).toBe("Mentioned by ChatGPT, Gemini and DeepSeek");
  expect(cloudSummary({ status: "failure", queries: [] })).toBeUndefined();
  expect(cloudSummary({ status: "pending", queries: [] })).toBeUndefined();
  expect(cloudSummary({ queries: [{ query_text: "best CRM", category: "comparison" }] })).toBe(
    "1 related searches: best CRM",
  );
});

it("keeps the approved target on a plan refusal and recognizes matching poll runs", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { CloudToolResultCard, cloudRunId } = await import("./chat.js");
  const refusal = {
    kind: "amicited-cloud-result",
    tool: "free_brand_visibility_start",
    arguments: { request: { website: "acme.com" } },
    result: {
      isError: true,
      structuredContent: {
        kind: "amicited-upgrade",
        url: "https://app.flowhunt.io/amicited/subscription",
        code: "plan_required",
        message:
          "`list_domains` needs an AmICited subscription, and this workspace does not have one yet. On the free plan this connection runs the free tools only: brand visibility, query fan-out, llms.txt generator, site health and AI watermark detection and removal (the `free_tools` toolset; see list_toolsets). A Pro plan or the trial unlocks every AmICited tool on this endpoint: daily tracking of how ChatGPT, Gemini, Perplexity and Google AI Overviews cite the brand, share of voice against competitors, the sources AI answers cite, AI-crawler site audits, Search Console, GA4 and ad-platform reports, and content the agent can write and publish. FlowHunt's AI Studio adds its own MCP endpoint for building and running AI agents and flows. Tell the user they can upgrade at https://app.flowhunt.io/amicited/subscription.",
      },
    },
  };
  const markup = renderToStaticMarkup(
    createElement(CloudToolResultCard, { cloud: refusal, onStartTrial() {} }),
  );
  expect(markup).toContain("brand visibility on acme.com");
  expect(markup).toContain('role="alert">Needs a Pro plan or trial. Free checks still work.');
  expect(markup).not.toContain("visibility on app.flowhunt.io");
  for (const result of [
    { structuredContent: { run_id: "brand-1", status: "pending" } },
    {
      content: [
        {
          type: "text",
          text: JSON.stringify({ run_id: "brand-1", status: "success", providers: [] }),
        },
      ],
    },
  ])
    expect(cloudRunId({ ...refusal, result })).toBe("brand-1");
  expect(cloudRunId(refusal)).toBeUndefined();
});

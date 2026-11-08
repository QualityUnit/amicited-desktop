import { expect, it } from "vite-plus/test";
import { withMarketingWebsite } from "./marketingContext";
import { marketingWebsiteInstructions } from "@amicited/tools-core";
it("supplies the current website as context while preserving the user's stored text", () => {
  const text = "Audit my website";
  const context = withMarketingWebsite(undefined, "https://example.com", true);
  expect(context?.records).toHaveLength(1);
  expect(context?.records[0]?.label).toBe("Website");
  expect(
    withMarketingWebsite(undefined, "https://changed.example", false)?.records[0],
  ).toMatchObject({ payload: { website: "https://changed.example" } });
  expect(withMarketingWebsite(undefined, undefined, true)).toBeUndefined();
  expect(marketingWebsiteInstructions(context?.records ?? [])).toContain("https://example.com");
  expect(marketingWebsiteInstructions([])).toBe("");
  expect(
    marketingWebsiteInstructions(
      withMarketingWebsite(undefined, undefined, false, true)?.records ?? [],
    ),
  ).toContain("For marketing tasks");
  const cmsContext = withMarketingWebsite(undefined, "https://acme.example", false, true, {
    cms: "wordpress",
  });
  expect(marketingWebsiteInstructions(cmsContext?.records ?? [])).toContain("WordPress");
  expect(marketingWebsiteInstructions(cmsContext?.records ?? [])).toContain(
    "do not claim you can edit",
  );
  const repoContext = withMarketingWebsite(undefined, "https://acme.example", false, true, {
    cms: "git",
    siteFiles: "/site",
    framework: "Next.js",
  });
  expect(marketingWebsiteInstructions(repoContext?.records ?? [])).toContain("Next.js");
  expect(marketingWebsiteInstructions(repoContext?.records ?? [])).toContain(
    "Agents can edit files in this folder",
  );
  expect(text).toBe("Audit my website");
});

it("returns report questions to an existing originating chat and rejects stale origins", async () => {
  const { marketingReturnThread } = await import("./marketingContext");
  const origin = { environmentId: "local", id: "campaign" };
  expect(marketingReturnThread("/local/campaign", [origin])).toBe(origin);
  expect(marketingReturnThread("/local/deleted", [origin])).toBeNull();
  expect(marketingReturnThread(null, [origin])).toBeNull();
});

it("attaches a current report separately from the visible question", async () => {
  const { withMarketingReport } = await import("./marketingContext");
  const report = { id: "newer", tool: "seo.site.audit", output: { score: 12 } };
  expect(withMarketingReport(undefined, report)?.records[0]).toMatchObject({
    kind: "marketing-report",
    payload: { report: { id: "newer", tool: "seo.site.audit", score: 12, findings: [] } },
  });
  expect(withMarketingReport(undefined, null)).toBeUndefined();
});

it("preserves a draft when managing or selecting an already connected assistant", async () => {
  const { shouldResumeMarketingDraft } = await import("./marketingContext");
  expect(shouldResumeMarketingDraft("manage", true)).toBe(false);
  expect(shouldResumeMarketingDraft("connect-and-send", false)).toBe(false);
  expect(shouldResumeMarketingDraft("connect-and-send", true)).toBe(true);
});
it("identifies marketing approvals from the tool identity rather than disclosure text", async () => {
  const { marketingApprovalInput } = await import("./marketingContext");
  const input = { name: "seo.site.audit", input: { url: "https://example.com" } };
  expect(marketingApprovalInput("mcp__t3__marketing_tools_run", input)).toEqual(input);
  expect(marketingApprovalInput("marketing_tools_run", {})).toBeNull();
  expect(marketingApprovalInput("Bash", { detail: "marketing_tools_run", ...input })).toBeNull();
});

it("only identifies the operation related to an approval, including concurrent requests", async () => {
  const { marketingApprovalTool } = await import("./marketingContext");
  const project = (item: Record<string, unknown>) =>
    ({
      sourceThreadId: "chat",
      item: { runId: "run", nodeId: null, parentItemId: null, ...item },
    }) as unknown as import("@t3tools/contracts").OrchestrationV2ProjectedTurnItem;
  const audit = project({
    id: "audit",
    type: "dynamic_tool",
    status: "failed",
    nodeId: "audit-node",
    toolName: "marketing_tools_run",
    input: { name: "seo.site.audit" },
  });
  const other = project({
    id: "other",
    type: "dynamic_tool",
    nodeId: "other-node",
    toolName: "marketing_tools_run",
    input: { name: "seo.meta.check" },
  });
  const command = project({
    type: "approval_request",
    requestId: "command",
    nodeId: "command-node",
  });
  const approval = project({
    type: "approval_request",
    requestId: "other-request",
    parentItemId: "other",
  });
  expect(marketingApprovalTool([audit, command], "command")).toBeNull();
  const nativeTool = project({
    id: "native",
    type: "dynamic_tool",
    nativeItemRef: { driver: "acpRegistry", nativeId: "execution" },
    toolName: "marketing_tools_run",
    input: { name: "content.readability" },
  });
  const nativeRequest = project({
    type: "approval_request",
    requestId: "native-request",
    nativeItemRef: { driver: "acpRegistry", nativeId: "execution" },
  });
  expect(marketingApprovalTool([audit, nativeTool, nativeRequest], "native-request")).toBe(
    nativeTool.item,
  );
  expect(marketingApprovalTool([audit, other, command, approval], "other-request")).toBe(
    other.item,
  );
  expect(marketingApprovalTool([audit, other, command, approval], "command")).toBeNull();
  expect(
    marketingApprovalTool(
      [audit, project({ type: "approval_request", requestId: "unknown" })],
      "unknown",
    ),
  ).toBeNull();
});
it("binds reports to scoped identities and consumes only the successfully sent report", async () => {
  const { marketingContextKey, withMarketingReport } = await import("./marketingContext");
  expect(marketingContextKey({ environmentId: "one", threadId: "chat" })).not.toBe(
    marketingContextKey({ environmentId: "two", threadId: "chat" }),
  );
  const context = withMarketingReport(undefined, {
    id: "audit",
    tool: "seo.site.audit",
    output: {
      score: 41,
      details: "large raw HTML",
      findings: [
        { title: "Add description", status: "fail", fix: "Write a summary" },
        { title: "Good", status: "pass" },
      ],
    },
  });
  expect(context?.records[0]).toMatchObject({
    payload: {
      report: {
        id: "audit",
        tool: "seo.site.audit",
        score: 41,
        findings: [{ title: "Add description", fix: "Write a summary" }],
      },
    },
  });
});
it("reads history status from shells without conversation items", async () => {
  const { marketingHistoryStatus } = await import("./marketingContext");
  expect(marketingHistoryStatus({ hasPendingApprovals: true, source: {} })).toBe("Needs your OK");
  expect(
    marketingHistoryStatus({
      hasPendingApprovals: false,
      latestRun: { status: "failed" },
      source: {},
    }),
  ).toBe("Couldn't check");
  expect(
    marketingHistoryStatus({
      hasPendingApprovals: false,
      latestRun: { status: "failed" },
      source: { lastError: "Claude could not authenticate. Run claude auth login" },
    }),
  ).toBe("Sign in needed");
  expect(marketingHistoryStatus({ hasPendingApprovals: false, source: {} })).toBe("Done");
  expect(
    marketingHistoryStatus({
      hasPendingApprovals: false,
      source: { latestMarketingCheckFailed: true },
    }),
  ).toBe("Couldn't check");
});

it("produces JSON-safe report context when a finding has no suggested fix", async () => {
  const { withMarketingReport } = await import("./marketingContext");
  const context = withMarketingReport(undefined, {
    id: "audit",
    tool: "seo.site.audit",
    output: { score: 41, findings: [{ title: "Add a description", status: "warn" }] },
  });
  const record = context?.records[0];
  expect(record && "payload" in record ? record.payload : null).toStrictEqual(
    JSON.parse(JSON.stringify(record && "payload" in record ? record.payload : null)),
  );
});

it("keeps bounded tool-specific evidence and targets in standalone report questions", async () => {
  const { withMarketingReport } = await import("./marketingContext");
  for (const [tool, output] of [
    ["content.write", { draft: "A useful draft", message: "Review before publishing" }],
    [
      "content.readability",
      { words: 100, grade: 7, longSentences: ["Shorten this sentence"], note: "Approximate" },
    ],
    ["serp.autocomplete", { suggestions: ["best shoes"], failedQueries: [] }],
    [
      "serp.fetch",
      {
        organic: [{ title: "Shoes", url: "https://example.com" }],
        peopleAlsoAsk: ["Which shoes?"],
      },
    ],
  ] as const) {
    const context = withMarketingReport(undefined, {
      id: tool,
      tool,
      input: { url: "https://example.com" },
      output,
    });
    expect(context?.records[0]).toMatchObject({
      payload: { report: { input: { url: "https://example.com" }, evidence: output } },
    });
  }
});
it("folds audit sections only for the same target and turn", async () => {
  const { marketingSubcheckCovered } = await import("./marketingContext");
  const project = (name: string, url: string, runId = "run", output?: unknown) =>
    ({
      item: {
        type: "dynamic_tool",
        toolName: "marketing_tools_run",
        input: { name, input: { url } },
        status: "completed",
        runId,
        output,
      },
    }) as unknown as import("@t3tools/contracts").OrchestrationV2ProjectedTurnItem;
  const projectAudit = (output?: unknown) =>
    project("seo.site.audit", "https://example.com", "run", output);
  const subcheck = project("seo.robots.check", "https://example.com");
  expect(marketingSubcheckCovered(subcheck, [projectAudit()])).toBe(false);
  const result = {
    id: "audit",
    tool: "seo.site.audit",
    input: {},
    startedAt: "now",
    durationMs: 1,
    status: "success",
    output: {
      status: "partial",
      groups: [
        {
          name: "AI crawler access",
          result: { status: "checked", score: 50, findings: [{ status: "warn" }] },
        },
      ],
    },
  };
  expect(marketingSubcheckCovered(subcheck, [projectAudit({ ...result, status: "error" })])).toBe(
    false,
  );
  const audit = projectAudit(result);
  expect(
    marketingSubcheckCovered(project("seo.sitemap.check", "https://example.com"), [audit]),
  ).toBe(false);
  expect(
    marketingSubcheckCovered(subcheck, [
      projectAudit({
        ...result,
        output: {
          ...result.output,
          groups: [
            {
              name: "AI crawler access",
              result: { status: "could_not_check", score: null, findings: [{ status: "unknown" }] },
            },
          ],
        },
      }),
    ]),
  ).toBe(false);
  expect(
    marketingSubcheckCovered(project("seo.robots.check", "https://example.com"), [audit]),
  ).toBe(true);
  expect(
    marketingSubcheckCovered(project("seo.robots.check", "https://other.example"), [audit]),
  ).toBe(false);
  expect(
    marketingSubcheckCovered(project("seo.robots.check", "https://example.com", "other"), [audit]),
  ).toBe(false);
  expect(
    marketingSubcheckCovered(project("content.readability", "https://example.com"), [audit]),
  ).toBe(false);
});

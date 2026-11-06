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
    payload: { report },
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
  expect(marketingApprovalInput("Bash", { detail: "marketing_tools_run", ...input })).toBeNull();
});

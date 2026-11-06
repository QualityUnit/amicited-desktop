import { expect, it } from "vite-plus/test";
import { withMarketingWebsite } from "./marketingContext";
import { marketingWebsiteInstructions } from "@amicited/tools-core";
it("supplies the website once as context while preserving the user's stored text", () => {
  const text = "Audit my website";
  const context = withMarketingWebsite(undefined, "https://example.com", true);
  expect(context?.records).toHaveLength(1);
  expect(context?.records[0]?.label).toBe("Website");
  expect(withMarketingWebsite(undefined, "https://example.com", false)).toBeUndefined();
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

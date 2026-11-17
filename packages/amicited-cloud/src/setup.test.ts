import { expect, it } from "vite-plus/test";
import { shouldShowSetup, defaultDomain, setupAfterWebsite, cloudSetupWebsites } from "./setup.ts";
import { guessBrandName } from "./domainModel.ts";
it.each([
  [false, 0, false, false],
  [true, 0, false, true],
  [true, 1, false, true],
  [true, 0, true, false],
  [true, 1, true, false],
])("gates setup after loading (%s, %s, %s)", (loaded, count, finished, expected) => {
  expect(shouldShowSetup(loaded, count, finished)).toBe(expected);
});
it("uses the last domain, falling back when it was removed", () => {
  const domains = [{ projectId: "first" }, { projectId: "last" }];
  expect(defaultDomain(domains, "last")).toBe(domains[1]);
  expect(defaultDomain(domains, "removed")).toBe(domains[0]);
  expect(defaultDomain([], "removed")).toBeUndefined();
});
it.each([
  ["flowhunt.io", "Flowhunt"],
  ["app.acme.co.uk", "Acme"],
  ["https://www.example.com/page", "Example"],
  ["example.io", "Example"],
  ["https://app.acme.com.au", "Acme"],
  ["", ""],
  ["https://", ""],
])("suggests the dashboard brand for %s", (url, expected) => {
  expect(guessBrandName(url)).toBe(expected);
});

it.each([
  ["new", "free", "assistant"],
  ["existing", "free", "assistant"],
  ["existing", "full", "cloud"],
  ["older", "free", "assistant"],
] as const)("routes %s websites on %s access", (_kind, access, expected) => {
  expect(setupAfterWebsite(access)).toBe(expected);
});

it("reads cloud website choices and existing prompts, tolerating a free-tier refusal", () => {
  const rows = [
    { domain_name: "northwind.io", prompts: [{ prompt_text: "Best tools?" }, "Compare tools"] },
  ];
  expect(
    cloudSetupWebsites({ content: [{ type: "text", text: JSON.stringify({ domains: rows }) }] }),
  ).toEqual([{ hostname: "northwind.io", prompts: ["Best tools?", "Compare tools"] }]);
  expect(cloudSetupWebsites({ isError: true, content: [{ text: "Upgrade required" }] })).toEqual(
    [],
  );
  expect(cloudSetupWebsites({ content: [{ text: "Offline" }] })).toEqual([]);
});

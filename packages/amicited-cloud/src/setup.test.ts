import { expect, it } from "vite-plus/test";
import {
  shouldShowSetup,
  defaultDomain,
  setupAfterWebsite,
  cloudSetupWebsites,
  cloudSetupPrompts,
} from "./setup.ts";
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

it("reads MCP website choices without enriching them with prompts", () => {
  expect(
    cloudSetupWebsites(
      {
        domains: [
          {
            domain_id: "remote",
            domain_name: "northwind.io",
            brand: "Northwind",
            prompts: ["Buyer question"],
          },
        ],
      },
      "work",
    ),
  ).toEqual([
    { workspaceId: "work", hostname: "northwind.io", domainId: "remote", brand: "Northwind" },
  ]);
  expect(() => cloudSetupWebsites(undefined, "work")).toThrow("website list");
});

it("reads the picked website's prompt text and allows suggestions when none are available", () => {
  expect(
    cloudSetupPrompts({
      prompts: [
        { content: "Brand recommendations" },
        { prompt_text: "Best tools?" },
        "Compare tools",
        {},
      ],
    }),
  ).toEqual(["Brand recommendations", "Best tools?", "Compare tools"]);
  expect(cloudSetupPrompts(undefined)).toEqual([]);
});

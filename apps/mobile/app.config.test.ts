import { afterEach, expect, it, vi } from "vite-plus/test";

import appleAppSiteAssociation from "../web/public/.well-known/apple-app-site-association.json";
import assetLinks from "../web/public/.well-known/assetlinks.json";

const INFRA_ENV = [
  "AMICITED_EAS_PROJECT_ID",
  "AMICITED_EAS_OWNER",
  "AMICITED_APPLE_TEAM_ID",
  "AMICITED_CLERK_RELYING_PARTY",
] as const;

// Keep config parsing independent of local env files and build credentials.
vi.mock("../../scripts/lib/public-config.ts", () => ({
  loadRepoEnv: () =>
    Object.fromEntries(
      ["APP_VARIANT", ...INFRA_ENV].map((key) => [key, process.env[key]] as const),
    ),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

async function loadConfig(variant: string | undefined, env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("APP_VARIANT", variant);
  for (const key of INFRA_ENV) vi.stubEnv(key, env[key]);
  return (await import("./app.config.ts")).default;
}

it.each(["prod", ""])("rejects APP_VARIANT=%j before selecting production IDs", async (value) => {
  await expect(loadConfig(value)).rejects.toThrow(
    "APP_VARIANT must be development, preview, or production.",
  );
});

it.each([
  [undefined, "com.amicited.desktop.mobile", "amicited", "AmICited"],
  ["development", "com.amicited.desktop.mobile.dev", "amicited-dev", "AmICited Dev"],
  ["preview", "com.amicited.desktop.mobile.preview", "amicited-preview", "AmICited Preview"],
  ["production", "com.amicited.desktop.mobile", "amicited", "AmICited"],
])("uses AmICited identifiers for APP_VARIANT=%j", async (value, identifier, scheme, name) => {
  const config = await loadConfig(value);
  expect(config.name).toBe(name);
  expect(config.scheme).toBe(scheme);
  expect(config.ios?.bundleIdentifier).toBe(identifier);
  expect(config.android?.package).toBe(identifier);
  expect(JSON.stringify(config)).not.toMatch(/t3\.codes|t3tools|t3code|pingdotgg|T3 Code|axiom/i);
});

it("leaves every infrastructure value unset without env", async () => {
  const config = await loadConfig("production");
  expect(config.owner).toBeUndefined();
  expect(config.extra?.eas?.projectId).toBeUndefined();
  expect(config.updates).toMatchObject({ enabled: false });
  expect(config.updates?.url).toBeUndefined();
  expect(config.ios?.appleTeamId).toBeUndefined();
  expect(config.ios?.associatedDomains).toEqual([]);
  expect(config.android?.intentFilters).toBeUndefined();
});

it("reads infrastructure values from env", async () => {
  const config = await loadConfig("production", {
    AMICITED_EAS_PROJECT_ID: "00000000-0000-4000-8000-000000000000",
    AMICITED_EAS_OWNER: "example-owner",
    AMICITED_APPLE_TEAM_ID: "TEAM123456",
    AMICITED_CLERK_RELYING_PARTY: "clerk.example.test",
  });
  expect(config.owner).toBe("example-owner");
  expect(config.extra?.eas?.projectId).toBe("00000000-0000-4000-8000-000000000000");
  expect(config.updates).toMatchObject({
    enabled: true,
    url: "https://u.expo.dev/00000000-0000-4000-8000-000000000000",
  });
  expect(config.ios?.appleTeamId).toBe("TEAM123456");
  expect(config.ios?.associatedDomains).toEqual([
    "applinks:clerk.example.test",
    "webcredentials:clerk.example.test",
  ]);
});

it("publishes no app association for another app", () => {
  // TODO(amicited-infra): list our team and app IDs here once AmICited hosts a web app domain.
  // https://github.com/QualityUnit/amicited-desktop/blob/main/apps/mobile/README.md#app-identity-and-amicited-infrastructure
  expect(appleAppSiteAssociation.applinks.details).toEqual([]);
  expect(assetLinks).toEqual([]);
});

import { expect, it } from "vite-plus/test";
import { detectFramework, domainInstruction } from "./domainModel.ts";

it.each([
  [["next.config.ts"], undefined, "Next.js"],
  [["astro.config.mjs"], undefined, "Astro"],
  [["hugo.toml"], undefined, "Hugo"],
  [["config.yaml"], undefined, null],
  [["config.yaml", "content"], undefined, "Hugo"],
  [["config.toml", "archetypes"], undefined, "Hugo"],
  [["_config.yml"], undefined, "Jekyll"],
  [["docusaurus.config.js"], undefined, "Docusaurus"],
  [[".eleventy.js"], undefined, "Eleventy"],
  [["gatsby-config.ts"], undefined, "Gatsby"],
  [[], '{"dependencies":{"next":"16"}}', "Next.js"],
  [[], '{"devDependencies":{"astro":"5"}}', "Astro"],
  [["astro.config.ts"], "invalid json", "Astro"],
  [[], "invalid json", null],
  [["README.md"], undefined, null],
])("detects site framework from %j", (files, json, expected) => {
  expect(detectFramework(files, json)).toBe(expected);
});
it("describes connected site access without requiring approval", () => {
  expect(domainInstruction({ cms: "wordpress" })).toContain("WordPress");
  expect(domainInstruction({ cms: "wordpress" })).toContain("do not claim you can edit");
  expect(domainInstruction({ cms: "git", siteFiles: "/site", framework: "Next.js" })).toContain(
    "Next.js",
  );
  expect(domainInstruction({ cms: "git", siteFiles: "/site" })).toContain("Agents can edit files");
});

it("does not invent an admin or CMS for an unknown site", () => {
  expect(domainInstruction({ cms: "unknown" })).not.toContain("uses Not sure");
  expect(domainInstruction({ cms: "unknown" })).not.toContain("its admin");
});

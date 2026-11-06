/// <reference lib="dom" />
// @effect-diagnostics nodeBuiltinImport:off - Standalone evidence writer owns files.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { Page, Locator } from "playwright-core";
const metrics = "components/amicited/dashboard/metrics/";
const samples = [
  [
    "status banner",
    '.am-result [aria-label="ATTENTION"]',
    '[data-specimen="banner"] > section',
    "components/amicited/ui/StatusNotification.tsx",
    "StatusNotification",
  ],
  [
    "search row",
    ".am-search-row",
    '[data-specimen="search"] :is(a,button)',
    "components/side-menu/SideNavRow.tsx",
    "SideNavRow",
  ],
  [
    "domain control",
    ".am-domain",
    '[data-specimen="domain"] button',
    "components/amicited/AmICitedDomainSwitcher.tsx",
    "AmICitedDomainSwitcher",
  ],
  [
    "finding badge",
    ".am-finding-row .am-status",
    '[data-specimen="badge"] > span',
    "components/ui/Badge.tsx",
    "Badge",
  ],
  [
    "finding row",
    ".am-finding-row",
    '[data-specimen="finding"] > div',
    "components/amicited/ui/signalRow.ts",
    "SIGNAL_ROW_CLASS",
  ],
  [
    "tool tab",
    ".am-pack-tabs a",
    '[data-specimen="strip"] button',
    "components/ui/TabStrip.tsx",
    "TabStrip",
  ],
  [
    "sidebar nav row",
    'aside a[aria-label="Tasks"]',
    '[data-specimen="nav"] :is(a,button)',
    "components/side-menu/SideNavRow.tsx",
    "SideNavRow",
  ],
  [
    "active nav row",
    'aside a[aria-current="page"]',
    '[data-specimen="active"] :is(a,button)',
    "components/side-menu/SideNavRow.tsx",
    "SideNavRow",
  ],
  [
    "card title",
    ".am-card h2",
    '[data-specimen="head"] h2',
    metrics + "ui.tsx",
    "DashboardSectionHead",
  ],
  [
    "card subtitle",
    ".am-card h2 + div",
    '[data-specimen="head"] h2 + div',
    metrics + "ui.tsx",
    "DashboardSectionHead",
  ],
  [
    "body text",
    ".am-card p:not([role])",
    '[data-specimen="body"] p',
    "components/ui/Text.tsx",
    "Text",
  ],
  [
    "primary button",
    '[data-marketing-button="default"]',
    '[data-specimen="primary"] button',
    "components/ui/Button.tsx",
    "Button",
  ],
  [
    "secondary button",
    '[data-marketing-button="outline"]',
    '[data-specimen="secondary"] button',
    "components/ui/Button.tsx",
    "Button",
  ],
  [
    "accent link",
    '[data-marketing-button="link"]',
    '[data-specimen="link"] button',
    "components/ui/Button.tsx",
    "Button",
  ],
  [
    "input",
    'input:not([type="checkbox"])',
    '[data-specimen="input"] input',
    "components/ui/TextInput.tsx",
    "TextInput",
  ],
  [
    "KPI label",
    "[data-kpi-strip] > div > span:first-child",
    '[data-specimen="trends"] [role="tab"] > span:first-child',
    metrics + "DashboardTrendsTabs.tsx",
    "DashboardTrendsTabs",
  ],
  [
    "KPI figure",
    "[data-kpi-strip] > div > span:nth-child(2) > span:first-child",
    '[data-specimen="trends"] [role="tab"] span[style]',
    metrics + "DashboardTrendsTabs.tsx",
    "DashboardTrendsTabs",
  ],
  [
    "trends tab",
    '[role="tab"]',
    '[data-specimen="trends"] [role="tab"]',
    metrics + "DashboardTrendsTabs.tsx",
    "DashboardTrendsTabs",
  ],
  [
    "trends label",
    '[role="tab"] > span:first-child',
    '[data-specimen="trends"] [role="tab"] > span:first-child',
    metrics + "DashboardTrendsTabs.tsx",
    "DashboardTrendsTabs",
  ],
  [
    "trends figure",
    '[role="tab"] span[style]',
    '[data-specimen="trends"] [role="tab"] span[style]',
    metrics + "DashboardTrendsTabs.tsx",
    "DashboardTrendsTabs",
  ],
  [
    "legend heading",
    ".am-result aside h2",
    '[data-specimen="legend"] h2',
    metrics + "DashboardTrendsLegend.tsx",
    "DashboardTrendsLegend",
  ],
  [
    "legend row",
    '.am-result [role="listitem"] > div',
    '[data-specimen="legend"] [role="listitem"] > div',
    metrics + "DashboardTrendsLegend.tsx",
    "DashboardTrendsLegend",
  ],
  [
    "legend value",
    '.am-result [role="listitem"] > div > span:last-child',
    '[data-specimen="legend"] [role="listitem"] > div > span:last-child',
    metrics + "DashboardTrendsLegend.tsx",
    "DashboardTrendsLegend",
  ],
  [
    "filter chip",
    ".am-scope-filters > span",
    '[data-specimen="filter"] button',
    "components/ui/controlSurface.ts",
    "filterTrigger",
  ],
] as const;
type Style = Record<string, string>;
type Row = {
  name: string;
  theme: string;
  stage: string;
  source: string;
  actual: Style;
  cloud: Style;
  differences: string[];
  usedFaces: string[];
  reason: string;
};
const rows = new Map<string, Row>();
let reference: Page | undefined;
export async function checkFonts(page: Page) {
  return page.evaluate(async () => {
    const result: Record<string, boolean> = {};
    for (const family of ["Inter", "Geist", "Geist Mono", "Fraunces"]) {
      const loaded = await document.fonts.load(`14px "${family}"`);
      result[family] = loaded.length > 0 && document.fonts.check(`14px "${family}"`);
    }
    if (Object.values(result).some((value) => !value))
      throw new Error("Font failed to load: " + JSON.stringify(result));
    return result;
  });
}
async function read(target: Locator) {
  return target.evaluate((el) => {
    const c = getComputedStyle(el);
    const props = [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "color",
      "backgroundColor",
      "padding",
      "height",
      "borderRadius",
    ] as const;
    return Object.fromEntries(props.map((key) => [key, c[key]]));
  });
}
export async function captureComputedStyles(page: Page, out: string, stage: string) {
  if (!reference) {
    reference = await page.context().browser()!.newPage({ deviceScaleFactor: 2 });
    await reference.setViewportSize({ width: 1022, height: 1800 });
    await reference.emulateMedia({ reducedMotion: "reduce" });
    await reference.setContent(
      await NodeFSP.readFile(NodePath.join(out, "cloud-specimens.html"), "utf8"),
    );
    await checkFonts(reference);
  }
  const theme = await page.evaluate(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  await reference.evaluate((theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.setAttribute("data-theme", theme);
  }, theme);
  await NodeFSP.mkdir(NodePath.join(out, "crops"), { recursive: true });
  for (const [name, selector, cloudSelector, file, component] of samples) {
    const key = theme + ":" + name;
    if (rows.has(key)) continue;
    const target = page.locator(selector).first();
    if (!(await target.isVisible())) continue;
    const specimen = reference.locator(cloudSelector).first();
    if (!(await specimen.isVisible())) throw new Error("Cloud component missing: " + name);
    const actual = await read(target),
      cloud = await read(specimen);
    const differences = Object.keys(actual).filter((key) => actual[key] !== cloud[key]);
    const sourceText = await NodeFSP.readFile(
      NodePath.join(process.env.AMICITED_CLOUD_SOURCE!, file),
      "utf8",
    );
    const declaration = new RegExp(`(?:const|function) ${component}\\b`).exec(sourceText);
    const line = sourceText.slice(0, declaration?.index ?? 0).split("\n").length;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    await target.evaluate((el, key) => el.setAttribute("data-parity-font", key), key);
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: `[data-parity-font="${key}"]`,
    });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    await cdp.detach();
    rows.set(key, {
      name,
      theme,
      stage,
      source: `${file}:${line}`,
      actual,
      cloud,
      differences,
      usedFaces: fonts.map((f) => `${f.familyName} (${f.isCustomFont ? "loaded" : "system"})`),
      reason: differences.length
        ? "Independent component measurements; see the property-specific exceptions below."
        : "",
    });
    await target.screenshot({
      path: NodePath.join(out, "crops", `${theme}-${name.replaceAll(" ", "-")}.png`),
      animations: "disabled",
    });
  }
}
export async function writeComputedStyles(out: string) {
  const missing = ["light", "dark"].flatMap((theme) =>
    samples.filter(([name]) => !rows.has(theme + ":" + name)).map(([name]) => theme + ":" + name),
  );
  const result = {
    reference:
      "flowhunt2 origin/main 44d4019d4c, actual source components bundled independently with Flowbite and the cloud token stylesheets; no desktop elements or styles are copied",
    rows: [...rows.values()],
    missing,
  };
  await NodeFSP.writeFile(
    NodePath.join(out, "computed-styles.json"),
    JSON.stringify(result, null, 2),
  );
  const compact = (style: Style) => Object.values(style).join("; ");
  const md =
    `# Computed style parity\n\n${result.reference}. Generated at 2×. Each source cell names the component declaration, under the exported frontend/src. Cloud specimens have the token root, Inter chrome and Geist content roots, and independently compiled tailwindShared/uiTokens/amicitedTokens stylesheets.\n\nThe fixture adapters replace routing, translation, disabled-reason and card-maximize services; tooltips render their children. These adapters do not supply classes, fonts or dimensions to the measured nodes. Flowbite uses the real cloud customTheme. Filter chips render HeaderFilterItem with the source filterTrigger function; the desktop scope is a noninteractive snapshot.\n\nValues: family; size; weight; line height; tracking; color; background; padding; height; radius.\n\n| Element / theme | Cloud source | Used face (CDP) | Desktop | Cloud | Differences |\n|---|---|---|---|---|---|\n` +
    result.rows
      .map(
        (row) =>
          `| ${row.name} / ${row.theme} | ${row.source} | ${row.usedFaces.join(", ")} | ${compact(row.actual)} | ${compact(row.cloud)} | ${row.differences.join(", ") || "Match"} |`,
      )
      .join("\n") +
    `\n\nMissing: ${missing.join(", ") || "none"}.\n\nExceptions: local KPI strips are static summaries, while the cloud comparison uses trends tabs (no invented period deltas). Tab widths and heights can differ with the number of metrics and the real local captions. The legend fixture has one plain series; desktop series carry favicon tiles and the owner badge. The T3 input has a 30px inner element inside a 32px bordered field wrapper; cloud TextInput draws the border on its 32px input. Dashboard specimens include the actual ink/container classes from AmICitedDashboardPage.tsx:212. Primary and secondary controls retain T3 accessibility and focus behavior. Scope chips are text snapshots rather than live country/provider dropdowns. No unequal row is reported as a match.\n`;
  await NodeFSP.writeFile("docs/amicited/parity/computed-styles.md", md);
}

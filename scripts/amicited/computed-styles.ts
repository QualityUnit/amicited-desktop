/// <reference lib="dom" />
// @effect-diagnostics nodeBuiltinImport:off - Standalone evidence writer owns files.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { Page } from "playwright-core";

const samples = [
  [
    "sidebar nav row",
    'aside a[aria-label="Tasks"]',
    "group/item relative flex w-full shrink-0 items-center gap-3 rounded-[9px] px-2.5 py-[9px] text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white",
    "Inter",
  ],
  [
    "active nav row",
    'aside a[aria-current="page"]',
    "group/item relative flex w-full shrink-0 items-center gap-3 rounded-[9px] px-2.5 py-[9px] text-left text-sm bg-primary-50 text-primary-700 hover:bg-primary-50 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/30 font-semibold",
    "Inter",
  ],
  [
    "group label",
    ".am-nav-group",
    "px-2.5 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 flex w-full items-center justify-between overflow-hidden rounded-md",
    "Inter",
  ],
  [
    "domain name",
    ".am-domain strong",
    "block truncate text-[13px] leading-tight font-semibold",
    "Inter",
  ],
  [
    "domain caption",
    ".am-domain small",
    "text-ai-ink-3 hidden truncate text-[11px] font-normal lg:block",
    "Inter",
  ],
  [
    "breadcrumb crumb",
    '[aria-label="Breadcrumb"] a',
    "hover:text-primary-700 dark:hover:text-primary-200 flex items-center gap-1.5 text-gray-400 transition-colors dark:text-gray-400 min-w-0",
    "Inter",
  ],
  [
    "breadcrumb leaf",
    '[aria-label="Breadcrumb"] h1',
    "flex items-center gap-1.5 font-medium text-gray-900 dark:text-white min-w-0",
    "Inter",
  ],
  [
    "header button",
    "[data-ask-agent]",
    "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border px-3 text-[13px] font-medium text-gray-900 dark:text-white",
    "Inter",
  ],
  ["card title", ".am-card h2", "text-base font-semibold text-[var(--ai-ink)]", "Geist"],
  [
    "card subtitle",
    ".am-card h2 + div",
    "mt-0.5 text-[13px] break-words text-[var(--ai-ink-3)]",
    "Geist",
  ],
  ["body text", ".am-card p:not([role])", "text-body text-ai-ink-2", "Geist"],
  [
    "KPI label",
    "[data-kpi-strip] > div > span:first-child",
    "block truncate text-xs font-medium text-[var(--ai-ink-3)]",
    "Geist",
  ],
  [
    "KPI figure",
    "[data-kpi-strip] > div > span:nth-child(2) > span:first-child",
    "font-[family-name:var(--font-ai-mono)] text-2xl font-semibold text-[var(--ai-ink)] tabular-nums",
    "Geist Mono",
  ],
  [
    "KPI caption",
    "[data-kpi-strip] > div > span:nth-child(2) > span:nth-child(2)",
    "truncate text-xs font-medium text-[var(--ai-ink-3)]",
    "Geist",
  ],
  [
    "status badge",
    ".am-status-pass",
    "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-ai-good-soft text-ai-good-ink",
    "Geist",
  ],
  [
    "banner eyebrow",
    '[data-kit="status-notification"] span.uppercase',
    "font-[family-name:var(--font-ai-mono)] text-xs leading-4 font-medium tracking-[0.08em] whitespace-nowrap uppercase text-ai-warn-ink",
    "Geist Mono",
  ],
  [
    "banner title",
    '[data-kit="agent-banner-header"] > span:first-child',
    "text-ai-ink order-2 min-w-0 flex-none basis-full text-sm @3xl/strip:order-none @3xl/strip:flex-1 @3xl/strip:truncate",
    "Geist",
  ],
  [
    "list row text",
    ".am-brand-name",
    "truncate text-[var(--ai-ink)] text-sm leading-[normal]",
    "Geist",
  ],
  [
    "input",
    'input:not([type="checkbox"])',
    "block w-full border border-gray-200 amicited:border-ai-surf-2 bg-white amicited:bg-ai-surf text-[13px] font-normal text-gray-900 amicited:text-ai-ink shadow-none outline-hidden h-8 rounded-lg px-2.5 py-0",
    "Geist",
  ],
  [
    "primary button",
    "main button.bg-primary-700, .am-onboarding button.bg-primary-700",
    "relative flex items-center justify-center rounded-lg text-center font-medium h-8 gap-1.5 px-3 text-[13px] whitespace-nowrap border-primary-700 bg-primary-700 border text-(--color-primary-700-contrast)",
    "Geist",
  ],
  [
    "you badge",
    '.am-brand-row [class*="rounded-full"][class*="text-caption"]',
    "inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-full h-4.5 px-2 text-caption bg-ui-accent/14 amicited:bg-ui-accent/14 text-ui-accent amicited:text-ui-accent",
    "Geist",
  ],
] as const;
type Style = Record<string, string>;
type Row = {
  name: string;
  stage: string;
  classes: string;
  actual: Style;
  cloud: Style;
  differences: string[];
  usedFaces: string[];
  reason: string;
};
const rows = new Map<string, Row>();
export async function checkFonts(page: Page) {
  return page.evaluate(async () => {
    const result: Record<string, boolean> = {};
    for (const family of ["Inter", "Geist", "Geist Mono", "Fraunces"]) {
      const loaded = await document.fonts.load(`14px "${family}"`);
      result[family] = loaded.length > 0 && document.fonts.check(`14px "${family}"`);
    }
    if (Object.values(result).some((loaded) => !loaded))
      throw new Error("Font failed to load: " + JSON.stringify(result));
    return result;
  });
}
export async function captureComputedStyles(page: Page, out: string, stage: string) {
  await NodeFSP.mkdir(NodePath.join(out, "crops"), { recursive: true });
  for (const [name, selector, classes, family] of samples) {
    if (rows.has(name)) continue;
    const target = page.locator(selector).first();
    if (!(await target.isVisible())) continue;
    const result = await target.evaluate(
      (el, { classes, family, name }: { classes: string; family: string; name: string }) => {
        const props = [
          "fontFamily",
          "fontSize",
          "fontWeight",
          "lineHeight",
          "letterSpacing",
          "color",
          "padding",
          "height",
          "borderRadius",
        ] as const;
        const read = (node: Element) => {
          const c = getComputedStyle(node);
          return Object.fromEntries(props.map((key) => [key, c[key]]));
        };
        const actual = read(el);
        if (name === "banner eyebrow") {
          classes = classes.replace(
            "text-ai-warn-ink",
            getComputedStyle(el).color === "rgb(155, 44, 34)"
              ? "text-ai-bad-ink"
              : getComputedStyle(el).color === "rgb(10, 107, 58)"
                ? "text-ai-good-ink"
                : "text-ai-warn-ink",
          );
        }
        const root = document.createElement("div");
        root.setAttribute("data-amicited-tokens", "");
        root.style.cssText =
          'position:fixed;left:-10000px;top:0;visibility:hidden;--font-ai-sans:Geist;--font-ai-mono:"Geist Mono";--font-ai-serif:Fraunces;font-size:16px;line-height:1.5;color:var(--ai-ink);';
        const reference = el.cloneNode(true) as HTMLElement;
        reference.className = classes;
        reference.style.display = getComputedStyle(el).display;
        root.style.fontFamily =
          family === "Geist"
            ? "Geist, ui-sans-serif, system-ui, sans-serif"
            : family === "Geist Mono"
              ? '"Geist Mono"'
              : "Inter, sans-serif";
        root.style.setProperty("--amicited-gray-900", "#111928");
        root.style.setProperty("--color-primary-700-contrast", "#ffffff");
        // Breadcrumbs inherit the cloud trail's 13px / 32px line box.
        if (name.startsWith("breadcrumb")) {
          root.style.fontSize = "13px";
          root.style.lineHeight = "32px";
        }
        // Components inherit the cloud body text role from their page.
        else if (family !== "Inter") {
          root.style.fontSize = "13px";
          root.style.lineHeight = "20px";
        }
        if (getComputedStyle(el).display !== "inline")
          reference.style.width = `${el.getBoundingClientRect().width}px`;
        root.append(reference);
        document.body.append(root);
        const cloud = read(reference);
        root.remove();
        return { actual, cloud };
      },
      { classes, family, name },
    );
    const differences = Object.keys(result.actual).filter(
      (key) => result.actual[key] !== result.cloud[key],
    );
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    const marked = await target.evaluate((el, name) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let text;
      while ((text = walker.nextNode())) {
        const parent = text.parentElement;
        if (text.textContent?.trim() && parent && parent.getBoundingClientRect().width > 0) {
          parent.setAttribute("data-parity-font", name);
          return true;
        }
      }
      return false;
    }, name);
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: marked ? `[data-parity-font="${name}"]` : selector,
    });
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const usedFaces = fonts.map(
      (font) => `${font.familyName} (${font.isCustomFont ? "loaded web font" : "system font"})`,
    );
    if (!usedFaces.length)
      usedFaces.push("Native control: CDP exposes no text glyphs; see loaded face assertion");
    await cdp.detach();
    rows.set(name, {
      name,
      stage,
      classes,
      ...result,
      differences,
      usedFaces,
      reason: differences.length
        ? "Local content/container differs from the isolated cloud class specimen; see differing properties."
        : "",
    });
    await target.screenshot({
      path: NodePath.join(out, "crops", name.replaceAll(" ", "-") + ".png"),
      animations: "disabled",
    });
  }
}
export async function writeComputedStyles(out: string) {
  const missing = samples.filter(([name]) => !rows.has(name)).map(([name]) => name);
  const result = {
    reference:
      "flowhunt2 origin/main 44d4019d4c; isolated class specimens rendered with the ported token CSS, not a live cloud session",
    rows: [...rows.values()],
    missing,
  };
  await NodeFSP.writeFile(
    NodePath.join(out, "computed-styles.json"),
    JSON.stringify(result, null, 2),
  );
  const fields = "family; size; weight; line-height; tracking; color; padding; height; radius";
  const compact = (style: Style) => Object.values(style).join("; ");
  const md =
    `# Computed style parity\n\nGenerated by scripts/amicited/computed-styles.ts during the 2× Chromium journey. Reference: ${result.reference}. Heights depend on the specimen's text and available width. Font checks additionally require a loaded FontFace, so a missing face cannot pass via fallback.\n\nValues: ${fields}.\n\n| Element | Used face (CDP) | Desktop | Cloud class specimen | Difference / reason |\n| --- | --- | --- | --- | --- |\n` +
    result.rows
      .map(
        (row) =>
          `| ${row.name} | ${row.usedFaces.join(", ")} | ${compact(row.actual)} | ${compact(row.cloud)} | ${row.differences.length ? row.differences.join(", ") + ": " + row.reason : "Match"} |`,
      )
      .join("\n") +
    `\n\nMissing specimens: ${missing.join(", ") || "none"}.\n`;
  await NodeFSP.mkdir("docs/amicited/parity", { recursive: true });
  await NodeFSP.writeFile("docs/amicited/parity/computed-styles.md", md);
}

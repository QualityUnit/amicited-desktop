import { View, parse, loader, parseExpression } from "vega";
import { compile, type TopLevelSpec } from "vega-lite";
import { evaluate, interpolate, expressionError, type ExpressionContext } from "./expressions.ts";
import type { Block, Format, ReportSpec } from "./spec.ts";
export interface RenderProblem {
  page: number;
  block: number;
  message: string;
}
export interface RenderOptions {
  spec: ReportSpec;
  datasets: Readonly<Record<string, unknown>>;
  errors?: Readonly<Record<string, string>>;
  context: ExpressionContext;
  narrative?: Readonly<Record<string, string>> | null;
  mode: "preview" | "snapshot";
  eventsUrl?: string;
  logoDataUrl?: string;
  generatedAt?: string;
  onProblem?: (problem: RenderProblem) => void;
}
export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function formatValue(value: unknown, format: Format = "text"): string {
  if (value === null || value === undefined) return "N/A";
  if (format === "text") return String(value);
  if (format === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.valueOf()) ? "N/A" : d.toISOString().slice(0, 10);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  return new Intl.NumberFormat(
    "en-US",
    format === "compact"
      ? { notation: "compact", maximumFractionDigits: 1 }
      : format === "percent"
        ? { style: "percent", maximumFractionDigits: 1 }
        : format === "currency"
          ? { style: "currency", currency: "USD" }
          : { maximumFractionDigits: 2 },
  ).format(n);
}
export function safeMarkdown(markdown: string): string {
  const inline = (text: string) =>
    escapeHtml(text)
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  let html = "";
  let list: "ul" | "ol" | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const item = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    if (item) {
      const tag = /^\d/.test(line) ? "ol" : "ul";
      if (list !== tag) {
        if (list) html += `</${list}>`;
        html += `<${tag}>`;
        list = tag;
      }
      html += `<li>${inline(item[1]!)}</li>`;
      continue;
    }
    if (list) {
      html += `</${list}>`;
      list = undefined;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) html += `<h${heading[1]!.length}>${inline(heading[2]!)}</h${heading[1]!.length}>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  return html + (list ? `</${list}>` : "");
}
export function tableRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === "object" && !Array.isArray(row),
      )
    : [];
}
function validateChartExpression(expression: string): void {
  const inspect = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if ("regex" in node || ("value" in node && node.value instanceof RegExp))
      throw new Error("Regular expressions are not supported in chart expressions");
    if ("type" in node && node.type === "CallExpression" && "callee" in node) {
      const callee = node.callee;
      if (callee && typeof callee === "object") {
        const property = "property" in callee ? callee.property : callee;
        const name =
          property && typeof property === "object"
            ? "name" in property
              ? property.name
              : "value" in property
                ? property.value
                : undefined
            : undefined;
        if (name === "sequence") throw new Error("Chart sequence expressions are not supported");
        if (["regexp", "test", "match"].includes(String(name)))
          throw new Error("Regular expressions are not supported in chart expressions");
      }
    }
    for (const child of Object.values(node)) inspect(child);
  };
  inspect(parseExpression(expression));
}
export function validateChartInput(block: Extract<Block, { type: "chart" }>, data: unknown) {
  const inspect = (value: unknown, key = ""): unknown => {
    if (["tickCount", "symbolLimit", "maxbins"].includes(key)) {
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error(`Chart ${key} requires a finite number (time intervals are not supported)`);
      return Math.max(key === "tickCount" ? 0 : 1, Math.min(50, Math.floor(value)));
    }
    if (key === "values" && !Array.isArray(value))
      throw new Error("Chart values require an explicit array");
    if (typeof value === "string") {
      if (
        /expr$/i.test(key) ||
        ["calculate", "filter", "test", "update", "signal", "init", "and", "or", "not"].includes(
          key,
        )
      )
        validateChartExpression(value);
      return value;
    }
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value))
      return (key === "values" ? value.slice(0, 50) : value).map((child) =>
        inspect(child, key === "values" ? "" : key),
      );
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => {
        // Bin size settings can create millions of bins from one row; only maxbins is bounded.
        if (
          (key === "bin" || key === "bins") &&
          ["step", "steps", "minstep", "extent", "base", "divide"].includes(childKey)
        )
          throw new Error(`Chart bin ${childKey} is not supported; use maxbins (at most 50)`);
        if (
          ["flatten", "fold", "impute", "density", "regression", "loess", "quantile"].includes(
            childKey,
          )
        )
          throw new Error(
            "Data-expanding chart transforms are not supported; reshape the query data instead",
          );
        if (["data", "datasets", "url", "href", "$schema"].includes(childKey))
          throw new Error(`Chart ${childKey} is not allowed; use the block's query data`);
        return [childKey, inspect(child, childKey)];
      }),
    );
  };
  if (!Array.isArray(data)) throw new Error("Expected an array of chart rows");
  if (data.length > 5000) throw new Error("Charts support at most 5,000 input rows");
  return inspect(block.vegaLite) as Record<string, unknown>;
}
export async function renderChartSvg(
  block: Extract<Block, { type: "chart" }>,
  data: unknown,
  theme: ReportSpec["theme"],
): Promise<string> {
  const spec = validateChartInput(block, data);
  const font = safeFont(theme.font);
  const compiled = compile({
    ...spec,
    data: { values: structuredClone(tableRows(data)) },
    ...(block.height ? { height: block.height } : {}),
    config: {
      background: theme.colors.background ?? "#ffffff",
      font,
      range: { category: [...theme.colors.series] },
      mark: { color: theme.colors.series[0] ?? theme.colors.primary },
      view: { stroke: null },
      axis: { labelColor: theme.colors.text, titleColor: theme.colors.text },
      legend: { labelColor: theme.colors.text, titleColor: theme.colors.text, symbolLimit: 50 },
      title: { color: theme.colors.primary },
    },
  } as TopLevelSpec).spec;
  const view = new View(parse(compiled), {
    renderer: "none",
    loader: {
      ...loader(),
      load: async () => {
        throw new Error("External chart resources are disabled");
      },
      sanitize: async () => {
        throw new Error("External chart resources are disabled");
      },
    },
  });
  try {
    await view.runAsync();
    for (const dataset of compiled.data ?? [])
      if (
        dataset.name &&
        Array.isArray(view.data(dataset.name)) &&
        view.data(dataset.name).length > 5000
      )
        throw new Error("Charts support at most 5,000 generated rows");
    const svg = await view.toSVG();
    if (Buffer.byteLength(svg) > 2 * 1024 * 1024)
      throw new Error("Chart SVG exceeds the 2 MB limit");
    return svg;
  } finally {
    view.finalize();
  }
}
const safeFont = (font?: string) =>
  font && /^[a-zA-Z0-9 ,'-]+$/.test(font) ? font : "Arial, sans-serif";
export async function renderReportHtml(options: RenderOptions): Promise<string> {
  const { spec, datasets, context, narrative, errors = {} } = options;
  const text = (s: string) => interpolate(s, datasets, context);
  const unavailable = (reason: string, page: number, block: number) => {
    options.onProblem?.({ page, block, message: reason });
    return `<p class="unavailable">Data unavailable: ${escapeHtml(reason)}</p>`;
  };
  const heading = async (title?: string) =>
    title ? `<h3 class="card-title">${escapeHtml(await text(title))}</h3>` : "";
  const numeric = (format?: Format) =>
    ["number", "compact", "percent", "currency"].includes(format ?? "");
  async function renderBlock(block: Block, pageIndex: number, blockIndex: number): Promise<string> {
    try {
      if (
        (block.type === "chart" || block.type === "table") &&
        (errors[block.data] || !Object.hasOwn(datasets, block.data))
      )
        throw new Error(errors[block.data] ?? "No data returned");
      switch (block.type) {
        case "heading": {
          const level = block.level ?? 2;
          return `<h${level}>${escapeHtml(await text(block.text))}</h${level}>`;
        }
        case "text":
          return `<div class="prose">${safeMarkdown(await text(block.markdown))}</div>`;
        case "pageBreak":
          return '<div class="page-break"></div>';
        case "narrative":
          return `<article class="card narrative">${await heading(block.title ?? "Commentary")}${narrative?.[block.id] ? safeMarkdown(narrative[block.id]!) : '<p class="muted">Commentary is not available yet.</p>'}</article>`;
        case "kpis": {
          const items = [];
          for (const item of block.items) {
            try {
              const value = await evaluate(item.value, datasets, context);
              if (value === undefined) throw new Error("No data returned");
              const delta = item.delta ? await evaluate(item.delta, datasets, context) : undefined;
              const hasDelta =
                delta !== undefined && delta !== null && Number.isFinite(Number(delta));
              const color =
                !hasDelta || Number(delta) === 0
                  ? "muted"
                  : Number(delta) > 0 === (item.goodWhen !== "down")
                    ? "good"
                    : "bad";
              items.push(
                `<article class="kpi-card"><span class="kpi-label">${escapeHtml(await text(item.label))}</span><strong>${escapeHtml(formatValue(value, item.format))}</strong><small class="${color}">${hasDelta ? `${Number(delta) > 0 ? "+" : ""}${escapeHtml(formatValue(delta, item.deltaFormat ?? "percent"))} <span>vs comparison</span>` : "No comparison available"}</small></article>`,
              );
            } catch (error) {
              items.push(
                `<article class="kpi-card">${unavailable(`${item.label}: ${expressionError(error)}`, pageIndex, blockIndex)}</article>`,
              );
            }
          }
          return `<div class="kpis">${items.join("")}</div>`;
        }
        case "chart":
          return `<article class="card chart-card">${await heading(block.title)}<div class="chart">${await renderChartSvg(block, datasets[block.data], spec.theme)}</div></article>`;
        case "table": {
          if (!Array.isArray(datasets[block.data]))
            throw new Error("Expected an array of table rows");
          const headers = await Promise.all(
            block.columns.map(
              async (c) =>
                `<th${numeric(c.format) ? ' class="numeric"' : ""}>${escapeHtml(await text(c.label ?? c.field))}</th>`,
            ),
          );
          const rows = tableRows(datasets[block.data]).slice(0, block.limit ?? 1000);
          return `<article class="card table-card">${await heading(block.title)}<table><thead><tr>${headers.join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${block.columns.map((c) => `<td${numeric(c.format) || typeof row[c.field] === "number" ? ' class="numeric"' : ""}>${escapeHtml(formatValue(row[c.field], c.format))}</td>`).join("")}</tr>`).join("")}</tbody></table></article>`;
        }
      }
    } catch (error) {
      return unavailable(expressionError(error), pageIndex, blockIndex);
    }
  }
  const meta = async (value: string, page = -1) => {
    try {
      return escapeHtml(await text(value));
    } catch (error) {
      const message = expressionError(error);
      options.onProblem?.({ page, block: -1, message });
      return `Data unavailable: ${escapeHtml(message)}`;
    }
  };
  const title = await meta(spec.title);
  const subtitle = spec.subtitle ? await meta(spec.subtitle) : "";
  const domain = escapeHtml(context.domain);
  const period = escapeHtml(context.period.label);
  const comparison = context.comparison
    ? `<span class="comparison">vs ${escapeHtml(context.comparison.label)}</span>`
    : "";
  const generated = new Date(options.generatedAt ?? Date.now()).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const logo = options.logoDataUrl ?? spec.theme.logo;
  const image =
    logo && /^data:image\/(png|jpeg|gif|webp|x-icon|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(logo)
      ? `<img class="logo" alt="Logo" src="${escapeHtml(logo)}">`
      : `<span class="brand-mark">${escapeHtml(context.domain.slice(0, 1).toUpperCase())}</span>`;
  const pages = [];
  for (const [pageIndex, page] of spec.pages.entries()) {
    const blocks = [];
    for (const [blockIndex, block] of page.blocks.entries())
      blocks.push(await renderBlock(block, pageIndex, blockIndex));
    pages.push(
      `<section class="page"><header class="report-header"><div class="brand">${image}<div><p class="eyebrow">${domain} / Performance report</p><h1>${title}</h1>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}</div></div><div class="period"><strong>${period}</strong>${comparison}</div></header><main class="page-content">${page.title ? `<h2 class="page-title">${await meta(page.title, pageIndex)}</h2>` : ""}${blocks.join("")}</main><footer><span>Generated ${escapeHtml(generated)} · ${domain}</span><span class="screen-page">${pageIndex + 1} / ${spec.pages.length}</span></footer></section>`,
    );
  }
  const colors = spec.theme.colors;
  const hex = (s: string | undefined, fallback: string) =>
    s && /^#[a-fA-F0-9]{3,8}$/.test(s) ? s : fallback;
  const landscape = spec.page.orientation === "landscape";
  const dimensions =
    spec.page.size === "16:9"
      ? [338.67, 190.5]
      : spec.page.size === "Letter"
        ? [215.9, 279.4]
        : [210, 297];
  const [width, height] = (
    spec.page.size === "16:9" ? spec.page.orientation === "portrait" : landscape
  )
    ? [dimensions[1]!, dimensions[0]!]
    : [dimensions[0]!, dimensions[1]!];
  const events = options.eventsUrl;
  const script =
    options.mode === "preview" &&
    events &&
    (/^\/(?!\/)/.test(events) || /^https?:\/\//.test(events))
      ? `<script>new EventSource(${JSON.stringify(events).replace(/</g, "\\u003c")}).onmessage=()=>location.reload()</script>`
      : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>
:root {
  --primary: ${hex(colors.primary, "#183b56")};
  --accent: ${hex(colors.accent ?? colors.series[0], "#0d9488")};
  --text: ${hex(colors.text, "#243746")};
  --muted: ${hex(colors.muted, "#64748b")};
  --paper: ${hex(colors.background, "#ffffff")};
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: var(--space-8);
  background: #e9edf1;
  color: var(--text);
  font: 13px/1.5 ${safeFont(spec.theme.font)};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.page {
  width: ${width}mm;
  min-height: ${height}mm;
  margin: 0 auto var(--space-8);
  padding: 14mm 15mm 10mm;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  box-shadow: 0 8px 32px #17203315;
}
.report-header {
  margin: -14mm -15mm var(--space-6);
  padding: 10mm 15mm 7mm;
  border-top: 5px solid var(--accent);
  background: var(--primary);
  color: white;
}
.brand { display: flex; gap: var(--space-4); align-items: center; }
.brand-mark { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 42px; border: 1px solid #ffffff60; border-radius: 10px; font-size: 24px; }
.logo { max-width: 100px; max-height: 52px; object-fit: contain; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: 26px; line-height: 1.2; letter-spacing: -0.6px; }
h2 { font-size: 19px; color: var(--primary); }
h3 { font-size: 14px; }
.eyebrow { font-size: 9px; letter-spacing: 1.1px; text-transform: uppercase; margin-bottom: var(--space-2); opacity: 0.8; }
.subtitle { font-size: 11px; margin-top: var(--space-2); opacity: 0.85; }
.period { display: flex; flex-wrap: wrap; gap: var(--space-3); font-size: 11px; margin-top: var(--space-6); }
.comparison { opacity: 0.75; }
.page-content { display: flex; flex-direction: column; gap: var(--space-4); flex: 1; }
.page-title { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); margin-bottom: var(--space-1); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: var(--space-3); }
.kpi-card, .card { border: 1px solid #e1e7ed; border-radius: 8px; background: var(--paper); }
.kpi-card { padding: var(--space-4); border-top: 3px solid var(--accent); }
.kpi-label { display: block; font-size: 10px; color: var(--muted); }
.kpi-card strong { display: block; color: var(--primary); font-size: 30px; line-height: 1.3; margin: var(--space-2) 0; font-variant-numeric: tabular-nums; }
.kpi-card small { font-size: 10px; }
.kpi-card small span { color: var(--muted); }
.card { padding: var(--space-4); }
.card-title { color: var(--primary); margin-bottom: var(--space-3); }
.chart svg { display: block; max-width: 100%; height: auto; }
.chart { width: 100%; }
.prose p + p, .narrative p + p { margin-top: var(--space-2); }
.prose h2, .prose h3 { margin-bottom: var(--space-2); }
.prose, .narrative { font-size: 12px; }
.narrative { border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 4%, var(--paper)); }
a { color: var(--accent); }
.good { color: #16703b; }
.bad { color: #b42318; }
.muted, .unavailable { color: var(--muted); }
.unavailable { padding: var(--space-3); background: #f5f7f9; border-radius: 6px; }
table { width: 100%; border-collapse: collapse; font-size: 10px; }
th { color: var(--muted); background: #f5f7f9; font-weight: 600; }
th, td { text-align: left; padding: var(--space-2); border-bottom: 1px solid #e8edf2; overflow-wrap: anywhere; }
tbody tr:nth-child(even) { background: #f8fafb; }
.numeric { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
footer { display: flex; justify-content: space-between; gap: var(--space-4); margin-top: var(--space-6); padding-top: var(--space-3); border-top: 1px solid #e1e7ed; color: var(--muted); font-size: 9px; }
.page-break { break-after: page; }
@page {
  size: ${width}mm ${height}mm;
  margin: 0 0 10mm;
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9px Arial, sans-serif; color: #64748b; padding-right: 15mm; }
}
@media print {
  body { padding: 0; background: white; }
  .page { margin: 0; min-height: ${height - 10}mm; box-shadow: none; break-after: page; }
  .page:last-child { break-after: auto; }
  .screen-page { display: none; }
  thead { display: table-header-group; }
  tr, .kpis, .card, .report-header { break-inside: avoid; }
}
</style></head><body>${pages.join("")}${script}</body></html>`;
}

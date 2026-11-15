import PptxGenJS from "pptxgenjs";
import { evaluate, interpolate, expressionError } from "./expressions.ts";
import {
  formatValue,
  renderChartSvg,
  validateChartInput,
  tableRows,
  type RenderOptions,
} from "./render.ts";
import type { Block } from "./spec.ts";
export interface PptxOptions extends RenderOptions {
  rasterize?: (svg: string) => Promise<Uint8Array>;
}
function nativeChart(block: Extract<Block, { type: "chart" }>, data: unknown) {
  validateChartInput(block, data);
  const spec = block.vegaLite;
  if (
    spec.layer ||
    spec.transform ||
    spec.facet ||
    spec.repeat ||
    spec.concat ||
    spec.hconcat ||
    spec.vconcat
  )
    return;
  const mark =
    typeof spec.mark === "string" ? spec.mark : (spec.mark as { type?: string } | undefined)?.type;
  if (!["bar", "line", "area", "arc"].includes(mark ?? "")) return;
  const encoding = spec.encoding as
    | Record<
        string,
        { field?: string; type?: string; aggregate?: unknown; bin?: unknown; timeUnit?: unknown }
      >
    | undefined;
  if (
    !encoding ||
    Object.keys(encoding).some((key) => !["x", "y", "color", "theta"].includes(key)) ||
    Object.values(encoding).some((e) => !e.field || e.aggregate || e.bin || e.timeUnit)
  )
    return;
  const horizontal =
    mark === "bar" && encoding.x?.type === "quantitative" && encoding.y?.type !== "quantitative";
  const x =
    mark === "arc" ? encoding.color?.field : horizontal ? encoding.y?.field : encoding.x?.field;
  const y =
    mark === "arc" ? encoding.theta?.field : horizontal ? encoding.x?.field : encoding.y?.field;
  if (!x || !y) return;
  const rows = tableRows(data);
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key =
      mark !== "arc" && encoding.color?.field ? String(row[encoding.color.field]) : "Series";
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const labels = [...new Set(rows.map((r) => String(r[x])))];
  if (groups.size * labels.length > 5000)
    throw new Error("Charts support at most 5,000 generated points");
  const series = [...groups].map(([name, values]) => {
    const points = new Map(values.map((r) => [String(r[x]), Number(r[y])]));
    return { name, labels, values: labels.map((label) => points.get(label) ?? 0) };
  });
  return {
    type: mark === "arc" ? ("pie" as const) : (mark as "bar" | "line" | "area"),
    series,
    horizontal,
  };
}
type Slide = ReturnType<InstanceType<typeof import("pptxgenjs").default>["addSlide"]>;
type TextRun = Exclude<Parameters<Slide["addText"]>[0], string>[number];
function markdownRuns(markdown: string): TextRun[] {
  const runs: TextRun[] = [];
  for (const line of markdown.split("\n")) {
    const heading = /^(#{1,6})\s+/.exec(line);
    const list = /^\s*(?:[-*+]|\d+\.)\s+/.test(line);
    const text = line
      .replace(/^(?:#{1,6}\s+|\s*(?:[-*+]|\d+\.)\s+)/, "")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
    const options = {
      fontSize: heading ? Math.max(15, 24 - heading[1]!.length * 2) : 15,
      ...(heading ? { bold: true } : {}),
      ...(list ? { bullet: true } : {}),
    };
    let offset = 0;
    for (const match of text.matchAll(/\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g)) {
      if (match.index > offset) runs.push({ text: text.slice(offset, match.index), options });
      runs.push({
        text: match[1] ?? match[2] ?? match[3] ?? match[4] ?? "",
        options: { ...options, ...(match[1] || match[2] ? { bold: true } : { italic: true }) },
      });
      offset = match.index + match[0].length;
    }
    runs.push({ text: text.slice(offset) || " ", options: { ...options, breakLine: true } });
  }
  return runs;
}
export async function renderReportPptx(options: PptxOptions): Promise<Uint8Array> {
  // PptxGenJS publishes CJS declarations for its ESM constructor.
  const Constructor = PptxGenJS as unknown as typeof import("pptxgenjs").default;
  const pptx = new Constructor();
  pptx.layout = "LAYOUT_WIDE";
  const { spec, datasets, context } = options;
  const color = spec.theme.colors.text.replace("#", "");
  const primary = spec.theme.colors.primary.replace("#", "");
  const font = spec.theme.font?.split(",")[0]?.replace(/['"]/g, "").trim() || "Arial";
  pptx.theme = { headFontFace: font, bodyFontFace: font };
  pptx.author = "AmICited";
  pptx.subject = spec.title;
  let titleFailed = false;
  const headerText = async (text: string, page = -1) => {
    try {
      return await interpolate(text, datasets, context);
    } catch (error) {
      const message = expressionError(error);
      if (page === -1) titleFailed = true;
      options.onProblem?.({ page, block: -1, message });
      return `Data unavailable: ${message}`;
    }
  };
  pptx.title = await headerText(spec.title);
  const logo =
    options.logoDataUrl &&
    /^data:image\/(png|jpeg|gif);base64,[A-Za-z0-9+/=]+$/.test(options.logoDataUrl)
      ? options.logoDataUrl
      : undefined;
  for (const [pageIndex, page] of spec.pages.entries()) {
    const slide = pptx.addSlide();
    slide.background = { color: (spec.theme.colors.background ?? "#ffffff").replace("#", "") };
    slide.addText(
      titleFailed ? pptx.title : page.title ? await headerText(page.title, pageIndex) : pptx.title,
      {
        x: 0.5,
        y: 0.3,
        w: logo ? 11.1 : 12.3,
        h: 0.6,
        color: primary,
        fontSize: 26,
      },
    );
    if (logo)
      slide.addImage({ data: logo, x: 11.9, y: 0.3, w: 0.8, h: 0.6, altText: "Report logo" });
    const blocks = page.blocks
      .map((block, blockIndex) => ({ block, blockIndex }))
      .filter(({ block }) => block.type !== "pageBreak");
    const height = 5.8 / Math.max(1, blocks.length);
    let y = 1.1;
    for (const { block, blockIndex } of blocks) {
      const box = { x: 0.5, y, w: 12.3, h: height - 0.1, color, fontSize: 15, breakLine: false };
      try {
        if (
          (block.type === "chart" || block.type === "table") &&
          (options.errors?.[block.data] || !Object.hasOwn(datasets, block.data))
        )
          throw new Error(options.errors?.[block.data] ?? "No data returned");
        switch (block.type) {
          case "heading":
            slide.addText(await interpolate(block.text, datasets, context), {
              ...box,
              color: primary,
              bold: true,
            });
            break;
          case "text":
            slide.addText(markdownRuns(await interpolate(block.markdown, datasets, context)), box);
            break;
          case "narrative":
            slide.addText(
              markdownRuns(options.narrative?.[block.id] ?? "Commentary is not available yet."),
              box,
            );
            break;
          case "kpis": {
            const texts = [];
            for (const item of block.items) {
              const value = await evaluate(item.value, datasets, context);
              texts.push(
                `${await interpolate(item.label, datasets, context)}: ${formatValue(value, item.format)}`,
              );
            }
            slide.addText(texts.join("\n"), box);
            break;
          }
          case "table":
            slide.addTable(
              [
                block.columns.map((c) => ({ text: c.label ?? c.field })),
                ...tableRows(datasets[block.data])
                  .slice(0, block.limit ?? 20)
                  .map((r) =>
                    block.columns.map((c) => ({ text: formatValue(r[c.field], c.format) })),
                  ),
              ],
              { ...box, autoPage: false, border: { color: primary, pt: 0.5 }, fontSize: 12 },
            );
            break;
          case "chart": {
            if (!Array.isArray(datasets[block.data]))
              throw new Error("Expected an array of chart rows");
            const native = nativeChart(block, datasets[block.data]);
            if (native)
              slide.addChart(native.type, native.series, {
                ...box,
                chartColors: spec.theme.colors.series.map((c) => c.replace("#", "")),
                showLegend: native.series.length > 1,
                barDir: native.horizontal ? "bar" : "col",
                ...(block.title
                  ? {
                      showTitle: true,
                      title: await interpolate(block.title, datasets, context),
                      titleColor: primary,
                    }
                  : {}),
              });
            else if (options.rasterize) {
              options.onProblem?.({
                page: pageIndex,
                block: blockIndex,
                message:
                  "Chart uses a raster image because native chart conversion is unavailable.",
              });
              const png = await options.rasterize(
                await renderChartSvg(block, datasets[block.data], spec.theme),
              );
              slide.addImage({
                data: `image/png;base64,${Buffer.from(png).toString("base64")}`,
                ...box,
              });
            } else {
              const message = "Chart preview requires image rendering.";
              options.onProblem?.({ page: pageIndex, block: blockIndex, message });
              slide.addText(message, box);
            }
            break;
          }
        }
      } catch (error) {
        options.onProblem?.({
          page: pageIndex,
          block: blockIndex,
          message: expressionError(error),
        });
        slide.addText(`Data unavailable: ${expressionError(error)}`, box);
      }
      y += height;
    }
  }
  const result = await pptx.write({ outputType: "uint8array" });
  if (!(result instanceof Uint8Array)) throw new Error("Unexpected PowerPoint output");
  return result;
}

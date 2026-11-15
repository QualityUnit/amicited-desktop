import { describe, expect, it, vi } from "vite-plus/test";
import JSZip from "jszip";
import { decodeReportSpec } from "./spec.ts";
import { resolvePeriod } from "./period.ts";
import { evaluate, interpolate, expressionError } from "./expressions.ts";
import { resolveQueries, runQueries } from "./query.ts";
import { renderReportHtml, renderChartSvg, safeMarkdown } from "./render.ts";
import { renderReportPptx } from "./pptx.ts";
import { aiVisibilityOverview, seoPerformance } from "./templates.ts";
const context = {
  domain: "example.com",
  workspaceId: "workspace",
  domainId: "domain",
  ...resolvePeriod({ default: "last_30_days" }, new Date(2026, 0, 31)),
  report: { title: "Test" },
};
describe("report spec and periods", () => {
  it("reports field paths and rejects invalid queries", () => {
    expect(() =>
      decodeReportSpec({
        ...seoPerformance,
        theme: { colors: { ...seoPerformance.theme.colors, primary: "red" } },
      }),
    ).toThrow(/theme[\s\S]*colors[\s\S]*primary/);
    expect(() =>
      decodeReportSpec({
        ...seoPerformance,
        pages: [],
        queries: { Bad: { path: "/v2/amicited/reports/traffic-series" } },
      }),
    ).toThrow();
    for (const path of [
      "https://evil.test",
      "/v2/auth/me",
      "/v2/amicited/../auth",
      "/v2/amicited/test?x=1",
      "/v2/amicited/%2e%2e/auth",
    ])
      expect(() =>
        decodeReportSpec({ ...seoPerformance, queries: { clicks: { path } } }),
      ).toThrow();
  });
  it("resolves calendar boundaries, leap years and comparison windows", () => {
    expect(resolvePeriod({ default: "previous_month" }, new Date(2024, 2, 1)).period).toMatchObject(
      { start: "2024-02-01", end: "2024-02-29" },
    );
    expect(resolvePeriod({ default: "previous_month" }, new Date(2026, 10, 15)).period.label).toBe(
      "October 2026",
    );
    expect(
      resolvePeriod({ default: "previous_quarter" }, new Date(2026, 10, 15)).period.label,
    ).toBe("Q3 2026");
    expect(resolvePeriod({ default: "month_to_date" }, new Date(2026, 9, 31)).period.label).toBe(
      "Oct 1 – Oct 31, 2026",
    );
    expect(
      resolvePeriod({ default: "previous_quarter" }, new Date(2026, 0, 1)).period,
    ).toMatchObject({ start: "2025-10-01", end: "2025-12-31" });
    expect(resolvePeriod({ default: "last_7_days" }, new Date(2026, 0, 1))).toMatchObject({
      period: { start: "2025-12-25", end: "2025-12-31" },
      comparison: { start: "2025-12-18", end: "2025-12-24" },
    });
    expect(
      resolvePeriod(
        { default: "month_to_date", comparison: "previous_year" },
        new Date(2024, 1, 29),
      ).comparison,
    ).toMatchObject({ start: "2023-02-01", end: "2023-02-28" });
    expect(
      resolvePeriod({ default: "year_to_date", comparison: "none" }, new Date(2026, 0, 1)),
    ).toMatchObject({ period: { start: "2026-01-01", end: "2026-01-01" }, comparison: null });
  });
});
describe("bounded expressions and queries", () => {
  it("interpolates JSONata and stops nonterminating recursion", async () => {
    expect(
      await interpolate(
        "{{ $domain }}: {{ $sum(clicks.value) }}",
        { clicks: [{ value: 2 }, { value: 3 }] },
        context,
      ),
    ).toBe("example.com: 5");
    await expect(evaluate("($f := function($x){$f($x+1)}; $f(0))")).rejects.toThrow(/limit/);
    await expect(
      evaluate("($f := function($x){1 + $f($x+1)}; $f(0))", {}, {}, { maxDepth: 10 }),
    ).rejects.toThrow(/depth limit/);
    expect(
      await Promise.all([
        evaluate("$domain", {}, { domain: "first" }),
        evaluate("$domain", {}, { domain: "second" }),
      ]),
    ).toEqual(["first", "second"]);
    await expect(evaluate("1", {}, {}, { timeoutMs: 0 })).rejects.toThrow(/time limit/);
    await expect(evaluate('$pad("a", 1e7, "b")')).rejects.toThrow(/pad.*allocation limit/);
    await expect(evaluate('$join(["a","b","c"], $pad("x", 700000, "x"))')).rejects.toThrow(
      /allocation limit|string limit/,
    );
    await expect(evaluate('$split("abc", "", 1e7)')).rejects.toThrow(/split.*allocation limit/);
    expect(await evaluate('$pad("a", 3, "b")')).toBe("abb");
    expect(await evaluate('$formatInteger(1500000, "#,##0")')).toBe("1,500,000");
    await expect(evaluate('$formatInteger(1500000, "w")')).rejects.toThrow(/allocation limit/);
    expect(await evaluate('$join(["a","b"], ",")')).toBe("a,b");
    expect(await evaluate('$string($map(["a","b"], $append))')).toBe('[["a",0],["b",1]]');
    expect(await evaluate("$", { text: "x".repeat(2 * 1024 * 1024) })).toHaveProperty("text");
    await expect(evaluate("$", { text: "x".repeat(5 * 1024 * 1024) })).rejects.toThrow(/5 MB/);
    const items = Array.from({ length: 400 }, (_, row) =>
      Object.fromEntries(Array.from({ length: 30 }, (_, field) => [`field_${field}`, row])),
    );
    expect(await evaluate("items[field_1 > 5]", { items })).toHaveLength(394);
    const lookup = Object.fromEntries(
      Array.from({ length: 3000 }, (_, key) => [`key_${key}`, key]),
    );
    const rows = Array.from({ length: 500 }, (_, key) => ({ key: `key_${key}` }));
    expect(
      await evaluate("$map(rows, function($r){$lookup(lookup, $r.key)})", { rows, lookup }),
    ).toHaveLength(500);
    await expect(evaluate('$match("a", /a+/)')).rejects.toThrow(
      "regular expressions are not supported in report expressions",
    );
    await expect(evaluate(`$eval('$match("a", /a+/)')`)).rejects.toThrow(/Dynamic evaluation/);
  });
  it("injects trusted ids, parses responses and isolates failures and caps", async () => {
    const requests = await resolveQueries(
      {
        ...seoPerformance,
        pages: [],
        queries: {
          clicks: {
            ...seoPerformance.queries.clicks!,
            params: {
              start_date: "{{ $period.start }}",
              comparison_start_date: "{{ $comparison.start }}",
            },
          },
          failed: { path: "/v2/amicited/test" },
          badParams: { path: "/v2/amicited/test", params: { start_date: "{{ ( }}" } },
          selector: { path: "/v2/amicited/test", params: { domain_ids: "other" } },
          badParse: { path: "/v2/amicited/test-parse", parse: "(" },
        },
      },
      context,
    );
    expect(requests[0]!.params).toMatchObject({
      workspace_id: "workspace",
      domain_id: "domain",
      start_date: context.period.start,
    });
    const noComparison = await resolveQueries(
      {
        ...seoPerformance,
        pages: [],
        queries: {
          clicks: {
            path: "/v2/amicited/reports/traffic-series",
            params: {
              start_date: "{{ $period.start }}",
              comparison_start_date: "{{ $comparison.start }}",
            },
          },
        },
      },
      { ...context, comparison: null },
    );
    expect(noComparison[0]!.params).not.toHaveProperty("comparison_start_date");
    const result = await runQueries(requests, async (path) => {
      if (path.endsWith("test")) throw new Error("Offline");
      return { clicks: [{ day: "2026-01-01", value: 42 }] };
    });
    expect(result.datasets.clicks).toEqual([{ day: "2026-01-01", value: 42 }]);
    expect(result.errors.failed).toBe("Offline");
    expect(result.errors.badParams).toMatch(/position/);
    expect(result.errors.badParse).toMatch(/position/);
    expect(result.errors.selector).toMatch(/selectors are injected/);
    expect(expressionError({ message: "Bad expression", code: "S0203", position: 4 })).toBe(
      "Bad expression (S0203) at position 4",
    );
    expect(
      (await runQueries(requests, async () => ({}), { responseSize: () => 6 * 1024 * 1024 })).errors
        .clicks,
    ).toMatch(/size limit/);
    expect(
      (await runQueries(requests.slice(0, 1), async () => ({ a: "long data" }), { maxBytes: 2 }))
        .errors.clicks,
    ).toMatch(/size limit/);
    await expect(
      resolveQueries(
        {
          ...seoPerformance,
          queries: Object.fromEntries(
            Array.from({ length: 31 }, (_, i) => [`q${i}`, { path: "/v2/amicited/test" }]),
          ),
        },
        context,
      ),
    ).rejects.toThrow(/30/);
  });
  it("cancels timed out fetches without failing successful queries", async () => {
    const requests = await resolveQueries(
      {
        ...seoPerformance,
        pages: [],
        queries: { slow: { path: "/v2/amicited/slow" }, fast: { path: "/v2/amicited/fast" } },
      },
      context,
    );
    let aborted = false;
    vi.useFakeTimers();
    try {
      const result = runQueries(requests, async (path, _params, signal) => {
        if (path.endsWith("fast")) return { value: 1 };
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("Query timed out"));
          }),
        );
      });
      await vi.advanceTimersByTimeAsync(30000);
      expect(await result).toMatchObject({
        datasets: { fast: { value: 1 } },
        errors: { slow: "Query timed out" },
      });
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("never runs more than four fetches at once", async () => {
    const requests = await resolveQueries(
      {
        ...seoPerformance,
        pages: [],
        queries: Object.fromEntries(
          Array.from({ length: 9 }, (_, i) => [`q${i}`, { path: "/v2/amicited/test" }]),
        ),
      },
      context,
    );
    let active = 0;
    let max = 0;
    await runQueries(requests, async () => {
      active++;
      max = Math.max(max, active);
      await Promise.resolve();
      active--;
      return {};
    });
    expect(max).toBe(4);
  });
});
describe("offline rendering", () => {
  it("escapes hostile values, uses safe markdown and isolates failed blocks", async () => {
    const hostile = '<script>alert("x")</script>';
    const spec = decodeReportSpec({
      ...seoPerformance,
      title: "{{ $domain }}",
      pages: [
        {
          blocks: [
            { type: "text", markdown: "{{ clicks[0].day }}" },
            { type: "table", data: "clicks", columns: [{ field: "day" }] },
            { type: "chart", data: "clicks", vegaLite: { mark: "line" } },
            { type: "narrative", id: "summary", prompt: "Summarize" },
          ],
        },
      ],
    });
    const html = await renderReportHtml({
      spec,
      datasets: { clicks: [{ day: hostile }] },
      context: { ...context, domain: hostile },
      mode: "snapshot",
    });
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Commentary is not available yet");
    const onProblem = vi.fn();
    const failed = await renderReportHtml({
      logoDataUrl: "data:image/x-icon;base64,AAABAA==",
      onProblem,
      spec,
      datasets: {},
      errors: { clicks: hostile },
      context,
      mode: "snapshot",
    });
    expect(failed).toContain("Data unavailable:");
    expect(failed).toContain("data:image/x-icon;base64,AAABAA==");
    expect(onProblem).toHaveBeenCalledWith({ page: 0, block: 1, message: hostile });
    expect(onProblem).toHaveBeenCalledWith({ page: 0, block: 2, message: hostile });
    expect(failed).not.toContain("<script");
    expect(
      safeMarkdown(
        "# Heading\n**bold** *italic*\n- item\n[x](javascript:alert(1))\n[ok](https://example.com)\n<img src=x>",
      ),
    ).toContain('<a href="https://example.com"');
    expect(safeMarkdown("[x](javascript:alert(1))")).not.toContain("href=");
    const preview = await renderReportHtml({
      spec,
      datasets: {},
      context,
      mode: "preview",
      eventsUrl: "/events?x=</script><script>alert(1)",
    });
    expect(preview).not.toContain("</script><script>");
  });
  it("bounds chart rows and disallows generated sequence expressions", async () => {
    const chart = {
      type: "chart" as const,
      data: "clicks",
      vegaLite: {
        mark: "bar",
        encoding: {
          x: { field: "day", type: "nominal" },
          y: { field: "value", type: "quantitative" },
        },
      },
    };
    await expect(
      renderChartSvg(
        chart,
        Array.from({ length: 5001 }, () => ({ day: "a", value: 1 })),
        seoPerformance.theme,
      ),
    ).rejects.toThrow(/5,000 input rows/);
    await expect(
      renderChartSvg(
        {
          ...chart,
          vegaLite: {
            ...chart.vegaLite,
            transform: [{ calculate: "sequence(0, 100000000)", as: "x" }],
          },
        },
        [],
        seoPerformance.theme,
      ),
    ).rejects.toThrow(/sequence expressions/);
    for (const expression of [
      "datum.value / 1000 / 1000",
      "datum.a / datum.b > datum.c / datum.d",
      "timeFormat(datum.value, '%m/%d/%Y')",
    ]) {
      await expect(
        renderChartSvg(
          {
            ...chart,
            vegaLite: { ...chart.vegaLite, transform: [{ calculate: expression, as: "derived" }] },
          },
          [{ day: "a", value: 1, a: 2, b: 3, c: 4, d: 5 }],
          seoPerformance.theme,
        ),
      ).resolves.toContain("<svg");
    }
    const counts = {
      ...chart,
      vegaLite: {
        mark: "point",
        encoding: {
          x: { field: "value", type: "quantitative", axis: { tickCount: 1e9 } },
          y: {
            field: "value",
            type: "quantitative",
            axis: { values: Array.from({ length: 1000 }, (_, i) => i) },
          },
          color: {
            field: "day",
            type: "nominal",
            legend: { values: Array.from({ length: 1000 }, (_, i) => `day-${i}`) },
          },
        },
      },
    };
    const svg = await renderChartSvg(counts, [{ day: "day-0", value: 1000 }], seoPerformance.theme);
    const labels = [...svg.matchAll(/<text(?:\s|>)/g)].length;
    expect(labels).toBeGreaterThan(20);
    expect(labels).toBeLessThanOrEqual(170);
    expect(counts.vegaLite.encoding.x.axis.tickCount).toBe(1e9);
    for (const symbolLimit of [undefined, 0]) {
      const legendSvg = await renderChartSvg(
        {
          ...chart,
          vegaLite: {
            mark: "point",
            encoding: {
              color: {
                field: "day",
                type: "nominal",
                ...(symbolLimit === undefined ? {} : { legend: { symbolLimit } }),
              },
            },
          },
        },
        Array.from({ length: 120 }, (_, i) => ({ day: `day-${i}` })),
        seoPerformance.theme,
      );
      expect([...legendSvg.matchAll(/<text(?:\s|>)/g)].length).toBeLessThanOrEqual(51);
    }
    for (const axis of [
      { tickCount: { signal: "1e9" } },
      { tickCount: "day" },
      { values: { signal: "sequence(0, 1e9)" } },
    ]) {
      await expect(
        renderChartSvg(
          {
            ...counts,
            vegaLite: {
              ...counts.vegaLite,
              encoding: { ...counts.vegaLite.encoding, x: { ...counts.vegaLite.encoding.x, axis } },
            },
          },
          [],
          seoPerformance.theme,
        ),
      ).rejects.toThrow(/finite number|explicit array/);
    }
    for (const bin of [{ step: 0.1 }, { steps: [0.001] }, { extent: [0, 1e9], step: 1 }]) {
      await expect(
        renderChartSvg(
          {
            ...chart,
            vegaLite: {
              mark: "bar",
              encoding: {
                x: { field: "value", type: "quantitative", bin },
                y: { aggregate: "count" },
              },
            },
          },
          Array.from({ length: 90 }, (_, i) => ({ value: i * 1000 })),
          seoPerformance.theme,
        ),
      ).rejects.toThrow(/Chart bin \w+ is not supported/);
    }
    for (const expression of [
      'test(regexp("(a+)+$"), datum.day)',
      "/(a+)+$/.test(datum.day)",
      'datum.day.match("a")',
      'replace(datum.day, /a+/, "b")',
    ]) {
      await expect(
        renderChartSvg(
          {
            ...chart,
            vegaLite: { ...chart.vegaLite, transform: [{ calculate: expression, as: "x" }] },
          },
          [],
          seoPerformance.theme,
        ),
      ).rejects.toThrow(/Regular expressions/);
    }
  });
  it.each([
    ["ai", "last_90_days"],
    ["seo", "last_90_days"],
    ["ai", "year_to_date"],
    ["seo", "year_to_date"],
  ] as const)("renders %s template for %s from OpenAPI-shaped fixtures", async (kind, period) => {
    const template = kind === "ai" ? aiVisibilityOverview : seoPerformance;
    const spec = { ...template, period: { ...template.period, default: period } };
    const periodContext = resolvePeriod(spec.period, new Date(2026, 11, 31));
    const context = {
      domain: "example.com",
      workspaceId: "workspace",
      domainId: "domain",
      ...periodContext,
      report: { title: spec.title },
    };
    const days =
      Math.round((Date.parse(context.period.end) - Date.parse(context.period.start)) / 86400000) +
      1;
    const dates = Array.from({ length: days }, (_, index) =>
      new Date(Date.parse(context.period.start) + index * 86400000).toISOString().slice(0, 10),
    );
    const platforms = ["chatgpt", "google", "gemini", "perplexity", "claude"];
    const series = (value: number) =>
      dates.flatMap((day) => platforms.map((platform) => ({ day, platform, value })));
    const fixture = (previous: boolean) => {
      const metric = { value: previous ? 10 : 12, prev: 8, unit: "%" };
      return {
        workspace_id: "workspace",
        domain_id: "domain",
        domain_name: "example.com",
        brand_name: null,
        range: {
          days,
          start_date: previous ? context.comparison!.start : context.period.start,
          end_date: previous ? context.comparison!.end : context.period.end,
        },
        kpis: {
          visibility: metric,
          share_of_voice: metric,
          avg_position: metric,
          citations: metric,
          tracked_prompts: metric,
          missing_prompts: metric,
        },
        platforms: [],
        timeseries: { series: [], rows: [] },
        top_sources: [],
        competitors: [],
        cited_by_segment: {},
        prompts: [],
        recent_citations: [],
        ribbon: [],
      };
    };
    const traffic = (previous: boolean) => ({
      keywords: [],
      striking_distance: [],
      top_3: [],
      top_10: [],
      top_20: [],
      top_100: [],
      clicks: series(previous ? 20 : 42),
      impressions: series(previous ? 100 : 140),
      ai_search_impressions: series(5),
      pages: [],
      click_pages: [],
      directories: [],
      paid_pages: [],
      paid_click_pages: [],
      paid_keywords: [],
      paid_clicks: [],
      sources: [],
    });
    const sources = {
      workspace_id: "workspace",
      domain_id: "domain",
      domain_name: "example.com",
      brand_name: null,
      range: fixture(false).range,
      stats: { citations: 40, domains: 1, urls: 3, your_pages: 3, external: 0, new_this_week: 1 },
      providers: [{ provider: "chatgpt", label: "ChatGPT" }],
      dates: [context.period.start],
      provider_series: [{ provider: "chatgpt", label: "ChatGPT", data: [40] }],
      domain_series: [],
      url_series: [],
      urls: [],
      domains: [
        {
          host: "example.com",
          is_you: true,
          source_type: "other",
          citations: 40,
          urls: 3,
          share: 0.4,
          delta: 0.2,
          prev_citations: 32,
          engines: [{ provider: "chatgpt", label: "ChatGPT" }],
          by_provider: { chatgpt: 40 },
          trend: [40],
        },
      ],
      mix: {},
      weekly_cadence: false,
    };
    const citations = {
      workspace_id: "workspace",
      domain_id: "domain",
      domain_name: "example.com",
      start_date: context.period.start,
      end_date: context.period.end,
      series: ["Example"],
      rows: [{ day: context.period.start, citations: { Example: 3 }, total: 10, positions: {} }],
      citation_series: ["example.com", "other.com"],
      citation_rows: dates.map((day) => ({
        day,
        citations: {
          "example.com": 4,
          "other.com": 6,
          "third.com": 2,
          "fourth.com": 8,
          "fifth.com": 3,
        },
        total: 23,
        positions: {},
      })),
      avg_positions: {},
      citation_share_prev: 0.3,
    };
    const movers = {
      grain: "keyword",
      date_range: { start: context.period.start, end: context.period.end },
      comparison_date_range: { start: context.comparison!.start, end: context.comparison!.end },
      points: [
        {
          entity: "agency reporting",
          group: "moved",
          previous_position: 8,
          current_position: 4,
          previous_clicks: 2,
          current_clicks: 10,
          previous_impressions: 20,
          current_impressions: 40,
          reason: "ranking",
          current_gsc_reported: true,
        },
      ],
      total: 1,
      entered_count: 0,
      left_count: 0,
    };
    const requests = await resolveQueries(spec, context);
    const results = await runQueries(requests, async (path, params) => {
      const previous = params.start_date === context.comparison!.start;
      switch (path) {
        case "/v2/amicited/analytics/dashboard-metrics":
          return fixture(previous);
        case "/v2/amicited/analytics/citations-timeseries":
          return citations;
        case "/v2/amicited/analytics/sources-metrics":
          return sources;
        case "/v2/amicited/reports/traffic-series":
          return traffic(previous);
        case "/v2/amicited/reports/position-movers":
          expect(params).toMatchObject({
            comparison_start_date: context.comparison!.start,
            comparison_end_date: context.comparison!.end,
            grain: "keyword",
            limit: 6,
          });
          return movers;
        default:
          throw new Error(`Unexpected template path: ${path}`);
      }
    });
    const onProblem = vi.fn();
    const html = await renderReportHtml({
      spec,
      ...results,
      context,
      mode: "snapshot",
      narrative: {
        summary: "**Evidence-backed** recommendations.",
        "seo-summary": "Prioritise ranking improvements.",
      },
      generatedAt: "2026-02-01T00:00:00Z",
      onProblem,
    });
    expect(results.errors).toEqual({});
    expect(onProblem).not.toHaveBeenCalled();
    expect(spec.pages).toHaveLength(2);
    expect(html.match(/<section class="page">/g)).toHaveLength(2);
    expect(html.match(/<svg/g)).toHaveLength(2);
    expect(html).not.toContain("Data unavailable");
    expect(html).not.toContain("<script");
    expect(html).toContain("Generated Feb 1, 2026");
    expect(html).toContain('class="numeric"');
    expect(html).toContain("vs comparison");
    if (template === seoPerformance) {
      expect(html).toContain("agency reporting");
      expect(html).toContain("+110%");
    } else {
      expect(results.datasets.citations).toHaveLength(days * 5);
      expect(results.datasets.citations).toEqual(
        expect.arrayContaining([
          { day: context.period.start, source: "example.com", citations: 4 },
          { day: context.period.end, source: "other.com", citations: 6 },
        ]),
      );
      expect(results.datasets.sources).toEqual(sources.domains);
      expect(html).toContain("+20%");
    }
  });
  it("produces a valid PowerPoint zip with native charts and one slide per page", async () => {
    const page = {
      blocks: [
        {
          type: "kpis" as const,
          items: [{ label: "Organic clicks", value: "$sum(clicks.value)" }],
        },
        seoPerformance.pages[0]!.blocks[1]!,
      ],
    };
    const spec = { ...seoPerformance, pages: [page, page] };
    const bytes = await renderReportPptx({
      spec,
      datasets: { clicks: [{ day: "2026-01-01", value: 42 }] },
      context,
      mode: "snapshot",
    });
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    expect(
      Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)),
    ).toHaveLength(2);
    expect(
      Object.keys(zip.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name)),
    ).toHaveLength(2);
    expect(await zip.file("ppt/slides/slide1.xml")!.async("string")).toContain("Organic clicks");
    const onProblem = vi.fn();
    await renderReportPptx({
      spec: {
        ...spec,
        pages: [
          {
            blocks: [
              {
                type: "chart",
                data: "clicks",
                vegaLite: {
                  mark: "point",
                  encoding: {
                    x: { field: "day", type: "temporal" },
                    y: { field: "value", type: "quantitative" },
                  },
                },
              },
            ],
          },
        ],
      },
      datasets: { clicks: [{ day: "2026-01-01", value: 42 }] },
      context,
      mode: "snapshot",
      onProblem,
    });
    expect(onProblem).toHaveBeenCalledWith({
      page: 0,
      block: 0,
      message: "Chart preview requires image rendering.",
    });
    await renderReportPptx({
      spec: {
        ...spec,
        pages: [
          {
            blocks: [
              {
                type: "chart",
                data: "clicks",
                vegaLite: {
                  mark: "bar",
                  encoding: {
                    x: { field: "day", type: "nominal" },
                    y: { field: "value", type: "quantitative" },
                    color: { field: "series", type: "nominal" },
                  },
                },
              },
            ],
          },
        ],
      },
      datasets: {
        clicks: Array.from({ length: 100 }, (_, i) => ({
          day: String(i),
          value: 1,
          series: String(i),
        })),
      },
      context,
      mode: "snapshot",
      onProblem,
    });
    expect(onProblem).toHaveBeenCalledWith({
      page: 0,
      block: 0,
      message: "Charts support at most 5,000 generated points",
    });
  });
  it("exports broken titles inline, embeds the frozen logo and formats markdown text", async () => {
    const logoDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGJ0AAAAASUVORK5CYII=";
    for (const broken of ["report", "page"]) {
      const problems = vi.fn();
      const spec = {
        ...seoPerformance,
        title: broken === "report" ? "{{ ( }}" : "Report",
        pages: [
          {
            title: broken === "page" ? "{{ ( }}" : "Page",
            blocks: [
              {
                type: "text" as const,
                markdown: "## Heading\n**Bold** and *italic*\n- First item\n1. Next item",
              },
            ],
          },
        ],
      };
      const bytes = await renderReportPptx({
        spec,
        datasets: {},
        context,
        logoDataUrl,
        mode: "snapshot",
        onProblem: problems,
      });
      const zip = await JSZip.loadAsync(bytes);
      const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
      expect(slide).toContain("Data unavailable:");
      expect(slide).toContain("Report logo");
      expect(
        Object.keys(zip.files).some(
          (path) => path.startsWith("ppt/media/") && path.endsWith(".png"),
        ),
      ).toBe(true);
      expect(slide).toContain("Heading");
      expect(slide).not.toContain("##");
      expect(slide).not.toContain("**Bold**");
      expect(slide).not.toContain("*italic*");
      expect(slide).toContain('b="1"');
      expect(slide).toContain('i="1"');
      expect(slide).toContain("a:buChar");
      expect(problems).toHaveBeenCalledWith(
        expect.objectContaining({ block: -1, message: expect.stringContaining("position") }),
      );
    }
  });
});

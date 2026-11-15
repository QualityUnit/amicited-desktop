import { decodeReportSpec, type ReportSpec } from "./spec.ts";
const base = {
  version: 1,
  period: { default: "last_30_days", comparison: "previous_period" },
  page: { size: "A4" },
  theme: {
    font: "Arial, sans-serif",
    logo: "domain",
    colors: {
      primary: "#183b56",
      accent: "#0d9488",
      text: "#243746",
      muted: "#64748b",
      background: "#ffffff",
      series: ["#0d9488", "#3867d6", "#e4a853", "#9b72cf"],
    },
  },
} as const;
const params = { start_date: "{{ $period.start }}", end_date: "{{ $period.end }}" };
const comparisonParams = {
  start_date: "{{ $comparison.start }}",
  end_date: "{{ $comparison.end }}",
};
const delta = (current: string, previous: string) =>
  `$comparison and (${previous}) > 0 ? ((${current}) - (${previous})) / (${previous}) : null`;
export const aiVisibilityOverview: ReportSpec = decodeReportSpec({
  ...base,
  title: "AI visibility overview",
  subtitle: "Brand discovery, citation momentum and the sources shaping your visibility",
  queries: {
    metrics: { path: "/v2/amicited/analytics/dashboard-metrics", params, parse: "$" },
    metricsComparison: {
      path: "/v2/amicited/analytics/dashboard-metrics",
      params: comparisonParams,
      parse: "$",
    },
    citations: {
      path: "/v2/amicited/analytics/citations-timeseries",
      params: { ...params, top_n: 5 },
      parse:
        '$reduce(citation_rows, function($rows, $r) { $append($rows, $each($r.citations, function($count, $host) { {"day": $r.day, "source": $host, "citations": $count} })) }, [])',
    },
    sources: {
      path: "/v2/amicited/analytics/sources-metrics",
      params,
      parse: "[domains^(>citations)[[0..7]]]",
    },
  },
  pages: [
    {
      title: "01 / Visibility & momentum",
      blocks: [
        {
          type: "kpis",
          items: [
            {
              label: "Visibility score",
              value: "metrics.kpis.visibility.value",
              format: "number",
              delta: delta(
                "metrics.kpis.visibility.value",
                "metricsComparison.kpis.visibility.value",
              ),
              goodWhen: "up",
            },
            {
              label: "Citations",
              value: "metrics.kpis.citations.value",
              format: "compact",
              delta: delta(
                "metrics.kpis.citations.value",
                "metricsComparison.kpis.citations.value",
              ),
              goodWhen: "up",
            },
            {
              label: "Average position",
              value: "metrics.kpis.avg_position.value",
              format: "number",
              delta: delta(
                "metrics.kpis.avg_position.value",
                "metricsComparison.kpis.avg_position.value",
              ),
              goodWhen: "down",
            },
          ],
        },
        {
          type: "text",
          markdown:
            "## How visible is {{ $domain }}?\nTrack your presence in AI answers alongside the websites those answers cite. Citation counts describe linked sources; they are distinct from brand mentions.",
        },
        {
          type: "chart",
          id: "citation-trend",
          title: "Citation momentum by source",
          data: "citations",
          height: 230,
          vegaLite: {
            width: 560,
            mark: { type: "line", point: true },
            encoding: {
              x: {
                field: "day",
                type: "temporal",
                title: null,
                axis: { format: "%b %d", labelAngle: 0, tickCount: 5 },
              },
              y: { field: "citations", type: "quantitative", title: "Citations" },
              color: { field: "source", type: "nominal", title: "Source" },
            },
          },
        },
        {
          type: "text",
          markdown:
            "**Reading the scorecard:** changes compare the selected period with {{ $comparison.label }}. A lower average position is an improvement.",
        },
      ],
    },
    {
      title: "02 / Sources & next steps",
      blocks: [
        {
          type: "chart",
          id: "source-leaders",
          title: "Most cited websites",
          data: "sources",
          height: 210,
          vegaLite: {
            width: 560,
            mark: "bar",
            encoding: {
              y: { field: "host", type: "nominal", sort: "-x", title: null },
              x: { field: "citations", type: "quantitative", title: "Citations" },
            },
          },
        },
        {
          type: "table",
          title: "Citation source leaderboard",
          data: "sources",
          limit: 6,
          columns: [
            { field: "host", label: "Website" },
            { field: "citations", label: "Citations", format: "number" },
            { field: "source_type", label: "Source type" },
            { field: "urls", label: "Pages cited", format: "number" },
          ],
        },
        {
          type: "narrative",
          id: "summary",
          title: "What this means for your brand",
          prompt:
            "Explain citation and visibility changes against metricsComparison. Identify the strongest sources, distinguish citation counts from brand mentions, and recommend three evidence-backed actions. Do not assume sources.prev_citations matches the selected comparison period.",
          data: ["metrics", "metricsComparison", "citations", "sources"],
        },
      ],
    },
  ],
});
export const seoPerformance: ReportSpec = decodeReportSpec({
  ...base,
  title: "SEO performance",
  subtitle: "Organic search demand, traffic and ranking opportunities",
  queries: {
    traffic: { path: "/v2/amicited/reports/traffic-series", params, parse: "$" },
    trafficComparison: {
      path: "/v2/amicited/reports/traffic-series",
      params: comparisonParams,
      parse: "$",
    },
    clicks: { path: "/v2/amicited/reports/traffic-series", params, parse: "clicks" },
    impressions: { path: "/v2/amicited/reports/traffic-series", params, parse: "impressions" },
    movers: {
      path: "/v2/amicited/reports/position-movers",
      params: {
        ...params,
        comparison_start_date: "{{ $comparison.start }}",
        comparison_end_date: "{{ $comparison.end }}",
        grain: "keyword",
        limit: 6,
      },
      parse: "points",
    },
  },
  pages: [
    {
      title: "01 / Organic search scorecard",
      blocks: [
        {
          type: "kpis",
          items: [
            {
              label: "Organic clicks",
              value: "$sum(traffic.clicks.value)",
              format: "compact",
              delta: delta("$sum(traffic.clicks.value)", "$sum(trafficComparison.clicks.value)"),
              goodWhen: "up",
            },
            {
              label: "Search impressions",
              value: "$sum(traffic.impressions.value)",
              format: "compact",
              delta: delta(
                "$sum(traffic.impressions.value)",
                "$sum(trafficComparison.impressions.value)",
              ),
              goodWhen: "up",
            },
            {
              label: "Click-through rate",
              value:
                "$sum(traffic.impressions.value) > 0 ? $sum(traffic.clicks.value) / $sum(traffic.impressions.value) : 0",
              format: "percent",
              delta: delta(
                "$sum(traffic.clicks.value) / $sum(traffic.impressions.value)",
                "$sum(trafficComparison.clicks.value) / $sum(trafficComparison.impressions.value)",
              ),
              goodWhen: "up",
            },
          ],
        },
        {
          type: "chart",
          id: "click-trend",
          title: "Daily organic clicks",
          data: "clicks",
          height: 205,
          vegaLite: {
            width: 560,
            mark: { type: "area", line: true, point: true, opacity: 0.25 },
            encoding: {
              x: {
                field: "day",
                type: "temporal",
                title: null,
                axis: { format: "%b %d", labelAngle: 0, tickCount: 5 },
              },
              y: { field: "value", type: "quantitative", title: "Clicks" },
            },
          },
        },
        {
          type: "chart",
          id: "impression-trend",
          title: "Search demand over time",
          data: "impressions",
          height: 165,
          vegaLite: {
            width: 560,
            mark: "line",
            encoding: {
              x: {
                field: "day",
                type: "temporal",
                title: null,
                axis: { format: "%b %d", labelAngle: 0, tickCount: 5 },
              },
              y: { field: "value", type: "quantitative", title: "Impressions" },
            },
          },
        },
      ],
    },
    {
      title: "02 / Ranking opportunities",
      blocks: [
        {
          type: "text",
          markdown:
            "## Turn visibility into traffic\nPrioritise queries where ranking changes can explain lost or gained clicks. Compare current positions with the selected comparison period before choosing your next content updates.",
        },
        {
          type: "table",
          title: "Keyword position movers",
          data: "movers",
          limit: 6,
          columns: [
            { field: "entity", label: "Keyword" },
            { field: "previous_position", label: "Prior rank", format: "number" },
            { field: "current_position", label: "Rank", format: "number" },
            { field: "previous_clicks", label: "Prior clicks", format: "number" },
            { field: "current_clicks", label: "Clicks", format: "number" },
          ],
        },
        {
          type: "narrative",
          id: "seo-summary",
          title: "Your next growth priorities",
          prompt:
            "Compare traffic against trafficComparison, interpret click and impression trends and the selected keyword movers, and recommend three prioritised SEO actions. Separate ranking effects from changes in search demand.",
          data: ["traffic", "trafficComparison", "movers"],
        },
      ],
    },
  ],
});
export const templates = [
  { id: "ai-visibility-overview", title: "AI visibility overview", spec: aiVisibilityOverview },
  { id: "seo-performance", title: "SEO performance", spec: seoPerformance },
] as const;

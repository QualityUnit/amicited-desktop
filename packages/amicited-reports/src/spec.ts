import * as Schema from "effect/Schema";

export const QueryId = Schema.String.check(Schema.isPattern(/^[a-z][a-zA-Z0-9_]{0,40}$/));
export const QueryPath = Schema.String.check(Schema.isPattern(/^\/v2\/amicited\/[a-z0-9_\-/]+$/));
export const Format = Schema.Literals(["number", "compact", "percent", "currency", "date", "text"]);
export type Format = typeof Format.Type;
const optional = Schema.optionalKey;
const Color = Schema.String.check(
  Schema.isPattern(/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/),
);
export const PeriodSpec = Schema.Struct({
  default: Schema.Literals([
    "last_7_days",
    "last_30_days",
    "last_90_days",
    "previous_month",
    "previous_quarter",
    "month_to_date",
    "year_to_date",
  ]),
  comparison: optional(Schema.Literals(["previous_period", "previous_year", "none"])),
});
export const Kpi = Schema.Struct({
  label: Schema.String,
  value: Schema.String,
  format: optional(Format),
  delta: optional(Schema.String),
  deltaFormat: optional(Format),
  goodWhen: optional(Schema.Literals(["up", "down"])),
});
export const Block = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("heading"),
    text: Schema.String,
    level: optional(Schema.Literals([1, 2, 3])),
  }),
  Schema.Struct({ type: Schema.Literal("text"), markdown: Schema.String }),
  Schema.Struct({ type: Schema.Literal("kpis"), items: Schema.Array(Kpi) }),
  Schema.Struct({
    type: Schema.Literal("chart"),
    id: optional(Schema.String),
    title: optional(Schema.String),
    data: QueryId,
    vegaLite: Schema.Record(Schema.String, Schema.Unknown),
    height: optional(Schema.Number.check(Schema.isGreaterThan(0))),
  }),
  Schema.Struct({
    type: Schema.Literal("table"),
    title: optional(Schema.String),
    data: QueryId,
    columns: Schema.Array(
      Schema.Struct({
        field: Schema.String,
        label: optional(Schema.String),
        format: optional(Format),
      }),
    ),
    limit: optional(Schema.Int.check(Schema.isGreaterThan(0))),
  }),
  Schema.Struct({
    type: Schema.Literal("narrative"),
    id: Schema.String,
    title: optional(Schema.String),
    prompt: Schema.String,
    data: optional(Schema.Array(QueryId)),
  }),
  Schema.Struct({ type: Schema.Literal("pageBreak") }),
]);
export type Block = typeof Block.Type;
export const ReportSpec = Schema.Struct({
  version: Schema.Literal(1),
  title: Schema.String,
  subtitle: optional(Schema.String),
  period: PeriodSpec,
  page: Schema.Struct({
    size: Schema.Literals(["A4", "Letter", "16:9"]),
    orientation: optional(Schema.Literals(["portrait", "landscape"])),
  }),
  theme: Schema.Struct({
    font: optional(Schema.String),
    colors: Schema.Struct({
      primary: Color,
      accent: optional(Color),
      text: Color,
      muted: optional(Color),
      background: optional(Color),
      series: Schema.Array(Color),
    }),
    logo: optional(
      Schema.String.check(
        Schema.isPattern(
          /^(?:domain|none|https:\/\/[^\s]+|data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+)$/,
        ),
      ),
    ),
  }),
  queries: Schema.Record(
    Schema.String,
    Schema.Struct({
      path: QueryPath,
      params: optional(
        Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
      ),
      parse: optional(Schema.String),
      sample: optional(Schema.Unknown),
    }),
  ).check(Schema.isPropertyNames(QueryId), Schema.isMaxProperties(30)),
  pages: Schema.Array(
    Schema.Struct({
      id: optional(Schema.String),
      title: optional(Schema.String),
      blocks: Schema.Array(Block),
    }),
  ),
});
export type ReportSpec = typeof ReportSpec.Type;
const decode = Schema.decodeUnknownSync(ReportSpec);
export const decodeReportSpec = (input: unknown): ReportSpec => {
  const spec = decode(input);
  if (Object.keys(spec.queries).length > 30)
    throw new Error("queries: at most 30 queries are allowed");
  for (const [pageIndex, page] of spec.pages.entries())
    for (const [blockIndex, block] of page.blocks.entries()) {
      if (
        (block.type === "chart" || block.type === "table") &&
        !Object.hasOwn(spec.queries, block.data)
      )
        throw new Error(
          `pages[${pageIndex}].blocks[${blockIndex}].data: unknown query ${block.data}`,
        );
    }
  return spec;
};

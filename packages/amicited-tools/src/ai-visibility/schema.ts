import * as Schema from "effect/Schema";
export const answerSchema = Schema.Struct({
  prompt: Schema.String,
  status: Schema.Literals(["answered", "could_not_check"]),
  excerpt: Schema.NullOr(Schema.String),
  mentioned: Schema.NullOr(Schema.Boolean),
  position: Schema.NullOr(Schema.Number),
  competitorsMentioned: Schema.Array(Schema.String),
  citations: Schema.Array(Schema.String),
});

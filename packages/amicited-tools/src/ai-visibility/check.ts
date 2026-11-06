import * as Schema from "effect/Schema";
import { define, urlSchema } from "../common.ts";
import type { Generation } from "../content/tools.ts";
export const visibilityInput = Schema.Struct({
  brand: Schema.String.check(Schema.isMinLength(1)),
  website: urlSchema,
  category: Schema.String.check(Schema.isMinLength(1)),
  market: Schema.optional(Schema.String),
  competitors: Schema.optional(Schema.Array(Schema.String)),
});
const answerSchema = Schema.Struct({
  prompt: Schema.String,
  status: Schema.Literals(["answered", "could_not_check"]),
  excerpt: Schema.NullOr(Schema.String),
  mentioned: Schema.NullOr(Schema.Boolean),
  position: Schema.NullOr(Schema.Number),
  competitorsMentioned: Schema.Array(Schema.String),
  citations: Schema.Array(Schema.String),
});
const output = Schema.Struct({
  status: Schema.Literals(["checked", "partial", "needs_provider", "could_not_check"]),
  message: Schema.String,
  provider: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  scope: Schema.Struct({
    assistants: Schema.Array(Schema.String),
    countries: Schema.Array(Schema.String),
    prompts: Schema.Array(Schema.String),
    runAt: Schema.String,
  }),
  answers: Schema.Array(answerSchema),
  summary: Schema.Struct({
    mentioned: Schema.Number,
    answered: Schema.Number,
    shareOfVoice: Schema.NullOr(Schema.Number),
    competitors: Schema.Array(Schema.Struct({ brand: Schema.String, answers: Schema.Number })),
  }),
});
export function visibilityTool(provider?: Generation) {
  return define(
    "ai.visibility.check",
    "AI visibility check",
    "See whether your connected assistant mentions your brand in realistic buyer answers.",
    visibilityInput,
    output,
    async (input, { signal }) => {
      const context = `${input.category}${input.market ? ` in ${input.market}` : ""}`;
      const prompts = [
        `What are the best ${context} options for a small business? Explain your recommendations.`,
        `Which ${context} options offer the best value, and why?`,
        `Compare leading ${context} options: strengths, limitations and who each suits.`,
        `What should I shortlist when choosing ${context}? Include source URLs if available.`,
      ];
      const scope = {
        assistants: provider ? [provider.provider] : [],
        countries: ["Location not verified; request runs from this machine."],
        prompts,
        runAt: new Date().toISOString(),
      };
      const brands = [...new Set([input.brand, ...(input.competitors ?? []).filter(Boolean)])];
      const answers = provider
        ? await Promise.all(
            prompts.map(async (prompt) => {
              try {
                const text = await provider.generate(
                  `Answer this buyer question independently, without using tools or searching. Do not fabricate URLs.\n${prompt}`,
                  signal,
                );
                if (!text.trim()) throw new Error("Empty answer");
                const mentioned = brands
                  .map((brand) => ({
                    brand,
                    index: text
                      .toLowerCase()
                      .search(
                        new RegExp(
                          `(?<![\\p{L}\\p{N}])${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
                          "iu",
                        ),
                      ),
                  }))
                  .filter((b) => b.index >= 0)
                  .sort((a, b) => a.index - b.index);
                const position = mentioned.findIndex((b) => b.brand === input.brand);
                return {
                  prompt,
                  status: "answered" as const,
                  excerpt: text.slice(0, 4000),
                  mentioned: position >= 0,
                  position: position >= 0 ? position + 1 : null,
                  competitorsMentioned: mentioned
                    .filter((b) => b.brand !== input.brand)
                    .map((b) => b.brand),
                  citations: [...new Set(text.match(/https?:\/\/[^\s<>"\])]+/g) ?? [])],
                };
              } catch {
                return {
                  prompt,
                  status: "could_not_check" as const,
                  excerpt: null,
                  mentioned: null,
                  position: null,
                  competitorsMentioned: [] as string[],
                  citations: [] as string[],
                };
              }
            }),
          )
        : [];
      const answered = answers.filter((a) => a.status === "answered").length;
      const mentions = answers.filter((a) => a.mentioned === true).length;
      const competitors = brands.slice(1).map((brand) => ({
        brand,
        answers: answers.filter((a) => a.competitorsMentioned.includes(brand)).length,
      }));
      const total = mentions + competitors.reduce((n, c) => n + c.answers, 0);
      return {
        status: !provider
          ? ("needs_provider" as const)
          : answered === 0
            ? ("could_not_check" as const)
            : answered < prompts.length
              ? ("partial" as const)
              : ("checked" as const),
        message: !provider
          ? "Connect Claude or ChatGPT to check your visibility."
          : "One assistant, one moment, from this machine. No live search. Position is first appearance among your brand and supplied competitors; share of voice uses only these brands. This is not market-wide visibility.",
        provider: provider?.provider ?? null,
        model: provider?.model ?? null,
        scope,
        answers,
        summary: {
          mentioned: mentions,
          answered,
          shareOfVoice: total ? Math.round((mentions / total) * 100) : answered ? 0 : null,
          competitors,
        },
      };
    },
    ["brand", "AI", "visibility", "mentions"],
  );
}

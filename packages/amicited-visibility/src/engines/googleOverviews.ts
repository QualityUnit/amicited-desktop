import { VisibilityEngine, defaultTiming, type EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";

/** Google Search with its AI Overview, which Google shows only for some queries. */
export class GoogleOverviewsEngine extends VisibilityEngine {
  readonly id = "google_overviews";
  readonly label = "Google AI Overviews";
  readonly site = "google";
  override readonly requiresLogin = false;
  override readonly timing = { ...defaultTiming, answerTimeoutMs: 8_000, answerOptional: true };
  readonly selectors = {
    input: 'textarea[name="q"], input[name="q"]',
    answer: '[data-attrid="AIOverview"], [data-attrid="wa:/description"]',
    busy: '[aria-label="Stop"]',
  };
  override entryUrl() {
    return "https://www.google.com/search";
  }
  protected ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    return this.typeAndSubmit(page, prompt, ctx);
  }
  protected override async extract(page: EnginePage, ctx: EngineContext) {
    const answer = await super.extract(page, ctx);
    return answer.text.trim() ? answer : { text: "No AI Overview shown", links: [] };
  }
}

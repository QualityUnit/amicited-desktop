import { VisibilityEngine, type EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";

/** Google AI Mode. */
export class GoogleAiModeEngine extends VisibilityEngine {
  readonly id = "google";
  readonly label = "Google AI Mode";
  readonly site = "google";
  override readonly requiresLogin = false;
  readonly selectors = {
    input: 'textarea[name="q"], input[name="q"]',
    answer: '[data-container-id="main-col"], [data-attrid="AIOverview"]',
    busy: '[aria-label="Stop"]',
  };
  override entryUrl() {
    return "https://www.google.com/search?udm=50";
  }
  protected ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    return this.typeAndSubmit(page, prompt, ctx);
  }
}

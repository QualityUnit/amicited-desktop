import { VisibilityEngine, type EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";

export class GeminiEngine extends VisibilityEngine {
  readonly id = "gemini";
  readonly label = "Gemini";
  readonly site = "google";
  readonly selectors = {
    input: '[contenteditable="true"]',
    answer: "model-response",
    busy: 'button[aria-label="Stop response"]',
  };
  override entryUrl() {
    return "https://gemini.google.com/app";
  }
  protected ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    return this.typeAndSubmit(page, prompt, ctx);
  }
}

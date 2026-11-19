import { VisibilityEngine, type EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";

export class PerplexityEngine extends VisibilityEngine {
  readonly id = "perplexity";
  readonly label = "Perplexity";
  readonly site = "perplexity";
  override readonly requiresLogin = false;
  readonly selectors = {
    input: 'textarea, [contenteditable="true"]',
    answer: '[class*="prose"]',
    busy: 'button[aria-label="Stop generating"]',
  };
  protected ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    return this.typeAndSubmit(page, prompt, ctx);
  }
}

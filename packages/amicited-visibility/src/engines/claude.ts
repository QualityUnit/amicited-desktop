import { VisibilityEngine, type EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";

export class ClaudeEngine extends VisibilityEngine {
  readonly id = "claude";
  readonly label = "Claude";
  readonly site = "claude";
  readonly selectors = {
    input: '[contenteditable="true"]',
    answer: "[data-is-streaming], .font-claude-response",
    busy: '[data-is-streaming="true"]',
  };
  protected ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    return this.typeAndSubmit(page, prompt, ctx);
  }
}

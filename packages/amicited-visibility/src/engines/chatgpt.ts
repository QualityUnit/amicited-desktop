import { VisibilityEngine, type EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";

export class ChatGptEngine extends VisibilityEngine {
  readonly id = "chatgpt";
  readonly label = "ChatGPT";
  readonly site = "chatgpt";
  readonly selectors = {
    input: "textarea, #prompt-textarea",
    answer: '[data-message-author-role="assistant"]',
    busy: '[data-testid="stop-button"]',
  };
  protected ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    return this.typeAndSubmit(page, prompt, ctx);
  }
}

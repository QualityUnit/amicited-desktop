import type { Page } from "playwright-core";
import { ask } from "./shared.ts";
export default (page: Page, prompt: string) =>
  ask(page, prompt, {
    url: "https://chatgpt.com/",
    input: "textarea, #prompt-textarea",
    answer: '[data-message-author-role="assistant"]',
    busy: '[data-testid="stop-button"]',
  });

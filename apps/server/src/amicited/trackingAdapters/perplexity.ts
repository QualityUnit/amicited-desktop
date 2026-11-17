import type { Page } from "playwright-core";
import { ask } from "./shared.ts";
export default (page: Page, prompt: string) =>
  ask(page, prompt, {
    url: "https://www.perplexity.ai/",
    input: 'textarea, [contenteditable="true"]',
    answer: '[class*="prose"]',
    busy: 'button[aria-label="Stop generating"]',
  });

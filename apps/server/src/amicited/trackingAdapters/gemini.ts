import type { Page } from "playwright-core";
import { ask } from "./shared.ts";
export default (page: Page, prompt: string) =>
  ask(page, prompt, {
    url: "https://gemini.google.com/app",
    input: '[contenteditable="true"]',
    answer: "model-response",
    busy: 'button[aria-label="Stop response"]',
  });

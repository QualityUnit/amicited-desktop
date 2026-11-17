import type { Page } from "playwright-core";
import { ask } from "./shared.ts";
export default (page: Page, prompt: string) =>
  ask(page, prompt, {
    url: "https://claude.ai/new",
    input: '[contenteditable="true"]',
    answer: "[data-is-streaming], .font-claude-response",
    busy: '[data-is-streaming="true"]',
  });

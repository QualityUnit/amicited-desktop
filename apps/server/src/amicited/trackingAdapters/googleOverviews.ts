import type { Page } from "playwright-core";
import { ask } from "./shared.ts";
export default (page: Page, prompt: string) =>
  ask(page, prompt, {
    url: "https://www.google.com/search",
    input: 'textarea[name="q"], input[name="q"]',
    answer: '[data-attrid="AIOverview"], [data-attrid="wa:/description"]',
    busy: '[aria-label="Stop"]',
  });

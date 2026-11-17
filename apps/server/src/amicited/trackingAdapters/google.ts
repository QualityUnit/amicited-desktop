import type { Page } from "playwright-core";
import { ask } from "./shared.ts";
export default (page: Page, prompt: string) =>
  ask(page, prompt, {
    url: "https://www.google.com/search?udm=50",
    input: 'textarea[name="q"], input[name="q"]',
    answer: '[data-container-id="main-col"], [data-attrid="AIOverview"]',
    busy: '[aria-label="Stop"]',
  });

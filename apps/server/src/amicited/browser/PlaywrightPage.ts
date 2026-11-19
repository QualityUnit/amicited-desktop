import type { EnginePage, PageScript } from "@amicited/visibility/page";
import type { Page } from "playwright-core";

/** Drives the AmICited browser, the managed Chromium profile used when the user's own browser cannot be. */
export function playwrightPage(page: Page, random: () => number): EnginePage {
  return {
    driver: "managed",
    browser: "AmICited browser",
    goto: async (url, options) => {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: options?.timeoutMs ?? 30_000,
      });
    },
    run<A, R>(script: PageScript<A, R>, arg: A) {
      return page.evaluate(script.fn as (arg: unknown) => R | Promise<R>, arg as unknown);
    },
    type: async (selector, text) => {
      const input = page.locator(selector).first();
      await input.click();
      await input.fill("");
      await input.pressSequentially(text, { delay: 25 + Math.round(random() * 35) });
    },
    press: (selector, key) => page.locator(selector).first().press(key),
    click: (selector) => page.locator(selector).first().click(),
    close: () => page.close(),
    isClosed: () => page.isClosed(),
  };
}

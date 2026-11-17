import type { Page } from "playwright-core";
import answers from "./fixtures/answers.json" with { type: "json" };
export function evidenceEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    import.meta.url.endsWith(".ts") &&
    env.NODE_ENV === "development" &&
    env.T3CODE_DEV_REPLAY_CAPTURE === "1" &&
    env.T3CODE_DEV_AMICITED_EVIDENCE === "1"
  );
}
export function evidencePage(index: number, beforeAnswer?: () => Promise<void>): Page {
  const answer = answers[index % answers.length]!;
  let closed = false;
  const locator = (selector: string): unknown => ({
    first: () => locator(selector),
    last: () => locator(selector),
    isVisible: async () => !/login|signin|ServiceLogin|captcha|challenge|turnstile/i.test(selector),
    fill: async () => {},
    press: async () => {},
    waitFor: async () => {},
    evaluate: async () => {},
    innerText: async () => {
      await beforeAnswer?.();
      return answer.text;
    },
    locator,
    evaluateAll: async () => answer.links,
  });
  return {
    goto: async () => {},
    locator,
    isClosed: () => closed,
    close: async () => {
      closed = true;
    },
  } as unknown as Page;
}

import type { Page } from "playwright-core";
export async function ask(
  page: Page,
  prompt: string,
  selectors: {
    url: string;
    input: string;
    answer: string;
    busy: string;
    answerTimeout?: number;
    optionalAnswer?: boolean;
  },
) {
  await page.goto(selectors.url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const input = page.locator(selectors.input).first();
  await input.fill(prompt);
  await input.press("Enter");
  const answer = page.locator(selectors.answer).last();
  try {
    await answer.waitFor({ state: "visible", timeout: selectors.answerTimeout ?? 90000 });
  } catch (error) {
    if (selectors.optionalAnswer && error instanceof Error && error.name === "TimeoutError")
      return { text: "No AI Overview shown", links: [] };
    throw error;
  }
  await page.locator(selectors.busy).first().waitFor({ state: "hidden", timeout: 120000 });
  await answer.evaluate(`element => new Promise((resolve, reject) => {
    let timer;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(finish, 1500);
    });
    const deadline = setTimeout(() => {
      observer.disconnect(); clearTimeout(timer); reject(new Error("Answer did not settle"));
    }, 120000);
    const finish = () => { observer.disconnect(); clearTimeout(deadline); resolve(); };
    observer.observe(element, {childList: true, subtree: true, characterData: true});
    timer = setTimeout(finish, 1500);
  })`);
  return {
    text: await answer.innerText(),
    links: await answer
      .locator("a[href]")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href") ?? "")),
  };
}

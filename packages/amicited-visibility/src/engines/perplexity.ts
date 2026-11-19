import { EngineStop, VisibilityEngine, defaultTiming, type EngineContext } from "../engine.ts";
import { inspect, type EnginePage } from "../page.ts";
import type { RawAnswer } from "../result.ts";
import type { ProbeResult } from "../sites.ts";
import {
  perplexityPrepare,
  perplexitySession,
  readPerplexityAnswer,
  type PerplexityPageAnswer,
} from "./perplexity.scripts.ts";

/** Where an answer stands, read from the thread API when it answers and the page otherwise. */
export interface PerplexityAnswer extends RawAnswer {
  readonly finished: boolean;
  /** Perplexity answered with its sign-up gate instead of an answer. */
  readonly signInWall: boolean;
  readonly via: "thread" | "page";
}

type Block = Record<string, unknown> & { readonly intended_usage?: unknown };
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");

// Short answers only, so a real answer that quotes the phrase is never thrown away.
const signUpWall = /^(?:please\s+)?(?:sign|log)\s?(?:up|in)\b.{0,80}(?:repeat|continue|request)/i;
export function isSignUpWall(answer: string) {
  const trimmed = answer.trim();
  return trimmed.length > 0 && trimmed.length <= 200 && signUpWall.test(trimmed);
}

/** Drops citation markers such as `[1]`, `[1][2]`, `[web:3]` and `[2](https://…)`. */
export function stripCitationMarkers(markdown: string) {
  return markdown
    .replace(/\[(?:web:|\^)?\d+(?:\s*[,–-]\s*(?:web:)?\d+)*\](?:\([^)\s]*\))?/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fromThread(thread: NonNullable<PerplexityPageAnswer["thread"]>) {
  const entry = thread.entries.at(-1);
  if (!entry) return null;
  const blocks = (Array.isArray(entry.blocks) ? entry.blocks : []).map(record) as Block[];
  const usage = (block: Block) => text(block.intended_usage);
  const answers = blocks.filter((b) => usage(b) === "ask_text" && b.markdown_block);
  const markdown = (
    answers.length
      ? answers
      : blocks.filter((b) => usage(b).startsWith("ask_text_") && b.markdown_block)
  ).map((b) => {
    const block = record(b.markdown_block);
    const chunks = Array.isArray(block.chunks) ? block.chunks.map(text).join("") : "";
    return { answer: text(block.answer) || chunks, done: block.progress === "DONE" };
  });
  const links = blocks
    .filter((b) => usage(b) === "web_results")
    .flatMap((b) => {
      const results = record(b.web_result_block).web_results;
      return Array.isArray(results) ? results.map(record) : [];
    })
    .filter((r) => !r.is_image && !r.is_attachment && !r.is_memory && !r.is_conversation_history)
    .map((r) => ({ url: text(r.url), title: text(r.name) }))
    .filter((r) => /^https?:\/\//.test(r.url));
  const status = text(entry.status);
  return {
    text: stripCitationMarkers(markdown.map((m) => m.answer).join("\n\n")),
    links,
    finished:
      ["COMPLETED", "FAILED"].includes(status) ||
      (markdown.length > 0 && markdown.every((m) => m.done) && status !== "IN_PROGRESS"),
  };
}

/** Prefers the thread API; the page fills in when the API is unavailable or still empty. */
export function perplexityAnswer(snapshot: PerplexityPageAnswer): PerplexityAnswer {
  const thread = snapshot.thread ? fromThread(snapshot.thread) : null;
  const page = snapshot.page;
  const answer = thread?.text
    ? { ...thread, links: [...thread.links, ...page.links], via: "thread" as const }
    : {
        text: page.text.trim(),
        links: page.links,
        finished: thread?.finished ?? (page.finished && !page.busy),
        via: "page" as const,
      };
  return { ...answer, signInWall: page.gated || isSignUpWall(answer.text) };
}

const threadPage = /^https:\/\/(?:www\.)?perplexity\.ai\/(?:search|session)\/[^/?#]+/;

export class PerplexityEngine extends VisibilityEngine {
  readonly id = "perplexity";
  readonly label = "Perplexity";
  readonly site = "perplexity";
  // Anonymous asks get "Sign up and repeat your request." instead of an answer.
  override readonly requiresLogin = true;
  override readonly timing = { ...defaultTiming, settleTimeoutMs: 180_000 };
  readonly selectors = {
    input: '#ask-input, div[contenteditable="true"][role="textbox"], textarea',
    submit: 'button[aria-label="Submit"]',
    answer: '[data-workflow-final-text] [data-renderer="lm"], .prose',
    busy: 'button[aria-label="Stop"]',
  };

  /** Perplexity's markup changes often, so the sign-in comes from its own session endpoint. */
  override async probe(page: EnginePage): Promise<ProbeResult> {
    const seen = await super.probe(page);
    if (seen === "captcha") return seen;
    const session = await page.run(perplexitySession, null).catch(() => null);
    return session === "signed_in" ? "logged_in" : session === "signed_out" ? "logged_out" : seen;
  }

  protected async ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    await page.run(perplexityPrepare, null);
    await this.typeAndSubmit(page, prompt, ctx);
    if (await this.openedThread(page, ctx)) return;
    // The click can land before the editor enables the button; Enter is the fallback.
    await page.press(this.selectors.input, "Enter");
    if (!(await this.openedThread(page, ctx)))
      throw new Error("Perplexity did not accept the prompt.");
  }

  private async openedThread(page: EnginePage, ctx: EngineContext) {
    const until = ctx.now().getTime() + 15_000;
    for (;;) {
      if (threadPage.test((await page.run(inspect, { selectors: [] })).url)) return true;
      if (ctx.now().getTime() >= until) return false;
      await ctx.sleep(500);
    }
  }

  private async read(page: EnginePage) {
    const answer = perplexityAnswer(await page.run(readPerplexityAnswer, null));
    if (answer.signInWall)
      throw new EngineStop("logged_out", "Perplexity asks you to sign in before it answers.");
    return answer;
  }

  protected override async waitForAnswer(page: EnginePage, ctx: EngineContext) {
    const t = this.timing;
    const appearBy = ctx.now().getTime() + t.answerTimeoutMs;
    let settleBy = Infinity;
    let previous = "";
    let stable = 0;
    for (let poll = 0; ; poll++) {
      const answer = await this.read(page);
      stable = answer.text && answer.text === previous ? stable + 1 : 0;
      previous = answer.text;
      if (answer.text && settleBy === Infinity) settleBy = ctx.now().getTime() + t.settleTimeoutMs;
      if (answer.text && ((answer.finished && stable >= 1) || stable >= t.fallbackStablePolls))
        return;
      if (answer.finished && !answer.text)
        throw new Error("Perplexity finished without an answer.");
      if (poll % 5 === 4 && (await this.probe(page)) === "captcha")
        throw new EngineStop(
          "blocked",
          "Perplexity is showing a CAPTCHA or bot check. Open it in your browser and complete it.",
        );
      const now = ctx.now().getTime();
      if (!answer.text && now >= appearBy)
        throw new Error(`Perplexity showed no answer within ${t.answerTimeoutMs / 1000}s.`);
      if (now >= settleBy)
        throw new Error(`Perplexity's answer did not finish within ${t.settleTimeoutMs / 1000}s.`);
      await ctx.sleep(t.pollMs);
    }
  }

  protected override async extract(page: EnginePage): Promise<RawAnswer> {
    const answer = await this.read(page);
    if (!answer.text) throw new Error("Perplexity's answer was empty.");
    return { text: answer.text, links: answer.links };
  }
}

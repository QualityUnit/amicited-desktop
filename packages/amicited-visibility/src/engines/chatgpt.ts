import { EngineStop, VisibilityEngine, defaultTiming, type EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";
import type { RawAnswer } from "../result.ts";
import {
  chatgptCitations,
  chatgptDismiss,
  chatgptRead,
  chatgptStatus,
  type ChatGptCitation,
  type ChatGptRead,
  type ChatGptStatus,
} from "./chatgpt.scripts.ts";

/** Longer prompts are typed, since `q` lives in the URL. */
const maxUrlPrompt = 1_500;
const markdownLink = /(?<!!)\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

/** Drops `utm_*` parameters, which ChatGPT adds to every link it shows (`utm_source=chatgpt.com`). */
export function cleanUrl(url: string) {
  try {
    const parsed = new URL(url);
    for (const key of Array.from(parsed.searchParams.keys()))
      if (/^utm_/i.test(key)) parsed.searchParams.delete(key);
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * Builds the answer from what the page showed. Sources keep the answer's order (the
 * markdown's links when the page has it, else the rendered links), then any extra entries
 * of the Sources panel. Titles come from the panel when it has one for that URL.
 */
export function chatgptAnswer(
  read: ChatGptRead,
  citations: readonly ChatGptCitation[],
  sawSearch: boolean,
): RawAnswer {
  const titles = new Map(citations.map((c) => [cleanUrl(c.url), c.title || c.publisher]));
  const ordered = [
    ...(read.markdown ? [...read.markdown.matchAll(markdownLink)] : []).map((m) => ({
      url: m[2]!,
      title: m[1]!,
    })),
    ...read.links,
    ...citations,
  ];
  const links = new Map<string, { url: string; title: string }>();
  for (const link of ordered) {
    const url = cleanUrl(link.url);
    if (links.has(url) || /^https?:\/\/([\w-]+\.)?chatgpt\.com\//.test(url)) continue;
    links.set(url, { url, title: titles.get(url) || link.title.trim() });
  }
  return {
    text: read.text,
    links: [...links.values()],
    webSearch: sawSearch || read.citations > 0 || read.sourcesButton,
  };
}

/**
 * chatgpt.com, signed in or not. `?q=` opens a fresh chat and sends the prompt without
 * synthetic typing; `temporary-chat=true` keeps it out of a signed-in user's history.
 * ChatGPT decides whether to search the web, as it does for the user.
 */
export class ChatGptEngine extends VisibilityEngine {
  readonly id = "chatgpt";
  readonly label = "ChatGPT";
  readonly site = "chatgpt";
  override readonly requiresLogin = false;
  // Reasoning models think before they write, and searching adds more.
  override readonly timing = {
    ...defaultTiming,
    answerTimeoutMs: 150_000,
    settleTimeoutMs: 240_000,
  };
  readonly selectors = {
    input: '#prompt-textarea, textarea[name="prompt"]',
    submit:
      'button[data-composer-submit], #composer-submit-button, button[data-testid="send-button"]',
    answer: '[data-assistant-markdown-root], [data-message-author-role="assistant"]',
    busy: '[data-message-streaming], [data-testid="stop-button"]',
    blocked: ['iframe[src*="arkoselabs"]', 'iframe[title*="challenge" i]'],
  };
  /** Pages whose answer showed the "Searching the web" phase. */
  private readonly searched = new WeakSet<EnginePage>();
  private readonly failures = new WeakMap<EnginePage, number>();

  override entryUrl(prompt: string) {
    const url = new URL("https://chatgpt.com/");
    url.searchParams.set("temporary-chat", "true");
    if (prompt.length <= maxUrlPrompt) url.searchParams.set("q", prompt);
    return url.href;
  }

  protected async ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    this.searched.delete(page);
    if (prompt.length <= maxUrlPrompt && (await this.untilSent(page, ctx, 20_000))) return;
    // The page did not take the prompt from the URL: type it, as a user would.
    await page.run(chatgptDismiss, {});
    await this.typeAndSubmit(page, prompt, ctx);
    if (!(await this.untilSent(page, ctx, 15_000)))
      throw new Error("ChatGPT did not take the prompt.");
  }

  /**
   * The signed-out page replaces itself when it sends (`/?q=` becomes `/uc/<id>`), and a
   * script that lands mid-navigation fails; null means "ask again", until it keeps failing.
   */
  private async status(page: EnginePage, ctx: EngineContext): Promise<ChatGptStatus | null> {
    try {
      const status = await page.run(chatgptStatus, {});
      this.failures.delete(page);
      return status;
    } catch (error) {
      const failures = (this.failures.get(page) ?? 0) + 1;
      this.failures.set(page, failures);
      if (failures >= 5) throw error;
      await ctx.sleep(1_000);
      return null;
    }
  }

  private async untilSent(page: EnginePage, ctx: EngineContext, timeoutMs: number) {
    const until = ctx.now().getTime() + timeoutMs;
    for (;;) {
      ctx.signal.throwIfAborted();
      if ((await this.status(page, ctx))?.sent) return true;
      if (ctx.now().getTime() >= until) return false;
      await ctx.sleep(1_000);
    }
  }

  protected override async waitForAnswer(page: EnginePage, ctx: EngineContext) {
    const t = this.timing;
    const appearBy = ctx.now().getTime() + t.answerTimeoutMs;
    let settleBy: number | null = null;
    let previous = -1;
    let stable = 0;
    let notices = 0;
    for (let poll = 0; ; poll++) {
      ctx.signal.throwIfAborted();
      const s = await this.status(page, ctx);
      if (!s) {
        await ctx.sleep(t.pollMs);
        continue;
      }
      if (s.searching) this.searched.add(page);
      if (poll % 5 === 4 && (await this.probe(page).catch(() => "unknown")) === "captcha")
        throw blockedStop();
      if (s.chars > 0) {
        settleBy ??= ctx.now().getTime() + t.settleTimeoutMs;
        stable = s.chars === previous ? stable + 1 : 0;
        previous = s.chars;
        // `complete` is ChatGPT's own end-of-answer marker; text alone can pause mid-answer.
        if ((s.complete && stable >= 1) || stable >= t.fallbackStablePolls) return;
        if (ctx.now().getTime() >= settleBy)
          throw new Error(`ChatGPT's answer did not finish within ${t.settleTimeoutMs / 1000}s.`);
      } else {
        notices = s.notice ? notices + 1 : 0;
        if (notices >= 3 || (s.notice && s.complete)) throw noticeStop(s);
        if (ctx.now().getTime() >= appearBy) {
          if (s.loginPrompt)
            throw new EngineStop("logged_out", "ChatGPT asks you to sign in before it answers.");
          throw new Error(`ChatGPT showed no answer within ${t.answerTimeoutMs / 1000}s.`);
        }
      }
      await ctx.sleep(t.pollMs);
    }
  }

  protected override async extract(page: EnginePage, _ctx: EngineContext) {
    const read = await page.run(chatgptRead, {});
    const citations =
      read.citations > 0 || read.sourcesButton
        ? await page.run(chatgptCitations, { waitMs: 2_000 }).catch(() => [])
        : [];
    const answer = chatgptAnswer(read, citations, this.searched.has(page));
    this.searched.delete(page);
    if (!answer.text.trim()) throw new Error("ChatGPT's answer was empty.");
    return answer;
  }
}

function blockedStop() {
  return new EngineStop(
    "blocked",
    "ChatGPT is showing a CAPTCHA or bot check. Open it in your browser and complete it.",
  );
}
function noticeStop(status: ChatGptStatus) {
  const notice = status.notice ?? "";
  if (/unusual activity/i.test(notice)) return blockedStop();
  return new EngineStop("failed", `ChatGPT did not answer: ${notice}`);
}

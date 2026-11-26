import { inspect, readAnswer, type EnginePage } from "./page.ts";
import {
  answeredResult,
  unansweredResult,
  type EngineId,
  type RawAnswer,
  type ResultBase,
  type Subject,
  type VisibilityResult,
} from "./result.ts";
import {
  challengeSelectors,
  classifyProbe,
  isChallengePage,
  sites,
  type ProbeResult,
  type SiteId,
} from "./sites.ts";

export interface EngineQuery extends Subject {
  readonly prompt: string;
  readonly country: string;
}
/** Time and cancellation come from the caller so tests and the scheduler control them. */
export interface EngineContext {
  readonly signal: AbortSignal;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
  /** Uniform in [0, 1). */
  readonly random: () => number;
}
export interface EngineSelectors {
  readonly input?: string;
  readonly submit?: string;
  /** The answer container; the last match is read. */
  readonly answer: string;
  /** Shown while the answer streams. */
  readonly busy?: string;
  /** Site-specific challenge markers, on top of the shared ones. */
  readonly blocked?: readonly string[];
}
export interface EngineTiming {
  readonly navigationTimeoutMs: number;
  /** How long the answer container may take to appear. */
  readonly answerTimeoutMs: number;
  /** How long the answer may stream once it appeared. */
  readonly settleTimeoutMs: number;
  readonly pollMs: number;
  /** Unchanged polls needed once the busy marker is gone. */
  readonly stablePolls: number;
  /** Unchanged polls that end the wait even if the busy marker never goes away. */
  readonly fallbackStablePolls: number;
  /** A missing answer container is an empty answer rather than a failure (AI Overviews). */
  readonly answerOptional: boolean;
}
export const defaultTiming: EngineTiming = {
  navigationTimeoutMs: 30_000,
  answerTimeoutMs: 90_000,
  settleTimeoutMs: 120_000,
  pollMs: 1_000,
  stablePolls: 3,
  fallbackStablePolls: 12,
  answerOptional: false,
};

/** Ends a run early with a definite status, such as a CAPTCHA or a sign-in wall. */
export class EngineStop extends Error {
  readonly status: "blocked" | "logged_out" | "failed";
  constructor(status: "blocked" | "logged_out" | "failed", message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * One AI answer engine. Subclasses supply selectors and `ask`; they may override
 * `entryUrl`, `waitForAnswer` and `extract`. `run` owns navigation, challenge and
 * sign-in detection, failure classification and the result model, and never throws
 * except when the caller cancels.
 */
export abstract class VisibilityEngine {
  abstract readonly id: EngineId;
  abstract readonly label: string;
  /** The site whose sign-in this engine uses. */
  abstract readonly site: SiteId;
  abstract readonly selectors: EngineSelectors;
  /** Whether an answer needs the user's sign-in; signed-out engines still answer when false. */
  readonly requiresLogin: boolean = true;
  /** False hides the engine from setup and results until its capture is fixed; stored answers still decode. */
  readonly supported: boolean = true;
  readonly timing: EngineTiming = defaultTiming;

  /** The page a run opens. Sites that accept the prompt (and country) in the URL can use them here. */
  entryUrl(_prompt: string, _country: string): string {
    return sites[this.site].url;
  }
  /** Puts the prompt to the opened page. */
  protected abstract ask(page: EnginePage, prompt: string, ctx: EngineContext): Promise<void>;

  /** Waits for the answer to appear, then for it to stop changing. */
  protected async waitForAnswer(page: EnginePage, ctx: EngineContext): Promise<void> {
    const t = this.timing;
    const read = () =>
      page.run(readAnswer, {
        selector: this.selectors.answer,
        which: "last",
        busy: this.selectors.busy,
      });
    const appearBy = ctx.now().getTime() + t.answerTimeoutMs;
    for (let poll = 0; ; poll++) {
      const snapshot = await read();
      if (snapshot.found && snapshot.text.trim()) break;
      if (poll % 5 === 4 && (await this.probe(page)) === "captcha") throw this.blocked();
      if (ctx.now().getTime() >= appearBy) {
        if (t.answerOptional) return;
        throw new Error(`${this.label} showed no answer within ${t.answerTimeoutMs / 1000}s.`);
      }
      await ctx.sleep(t.pollMs);
    }
    const settleBy = ctx.now().getTime() + t.settleTimeoutMs;
    let previous = "";
    let stable = 0;
    for (;;) {
      await ctx.sleep(t.pollMs);
      const snapshot = await read();
      stable = snapshot.text === previous ? stable + 1 : 0;
      previous = snapshot.text;
      if ((!snapshot.busy && stable >= t.stablePolls) || stable >= t.fallbackStablePolls) return;
      if (ctx.now().getTime() >= settleBy)
        throw new Error(
          `${this.label}'s answer did not finish within ${t.settleTimeoutMs / 1000}s.`,
        );
    }
  }

  /** Reads the answer text and its links. */
  protected async extract(page: EnginePage, _ctx: EngineContext): Promise<RawAnswer> {
    const snapshot = await page.run(readAnswer, { selector: this.selectors.answer, which: "last" });
    return { text: snapshot.text, links: snapshot.links };
  }

  /** Reads the page's sign-in and challenge markers. */
  async probe(page: EnginePage): Promise<ProbeResult> {
    return (await this.observe(page)).probe;
  }
  private async observe(page: EnginePage): Promise<{ probe: ProbeResult; url: string | null }> {
    const site = sites[this.site];
    const state = await page.run(inspect, {
      selectors: [
        site.loggedIn,
        site.loggedOut,
        ...challengeSelectors,
        ...(this.selectors.blocked ?? []),
      ],
    });
    const [loggedIn = false, loggedOut = false, ...challenges] = state.visible;
    const probe = classifyProbe({
      loggedIn,
      loggedOut,
      captcha: challenges.some(Boolean) || isChallengePage(state),
    });
    return { probe, url: /^https?:/.test(state.url) ? state.url : null };
  }

  async run(page: EnginePage, query: EngineQuery, ctx: EngineContext): Promise<VisibilityResult> {
    const base = (session: ProbeResult): ResultBase => ({
      engine: this.id,
      prompt: query.prompt,
      country: query.country,
      capturedAt: ctx.now().toISOString(),
      session: session === "logged_in" || session === "logged_out" ? session : "unknown",
    });
    let session: ProbeResult = "unknown";
    try {
      ctx.signal.throwIfAborted();
      await page.goto(this.entryUrl(query.prompt, query.country), {
        timeoutMs: this.timing.navigationTimeoutMs,
      });
      session = await this.checkpoint(page);
      await this.ask(page, query.prompt, ctx);
      await this.waitForAnswer(page, ctx);
      const answer = await this.extract(page, ctx);
      const after = await this.observe(page).catch(() => ({
        probe: "unknown" as const,
        url: null,
      }));
      if (after.probe === "captcha") throw this.blocked();
      return answeredResult(
        { ...base(after.probe === "unknown" ? session : after.probe), pageUrl: after.url },
        answer,
        query,
      );
    } catch (error) {
      if (ctx.signal.aborted) throw error;
      if (error instanceof EngineStop)
        return unansweredResult(
          base(error.status === "logged_out" ? "logged_out" : session),
          error.status,
          error.message,
        );
      const state = await this.probe(page).catch((): ProbeResult => "unknown");
      if (state === "captcha")
        return unansweredResult(base(session), "blocked", this.blocked().message);
      if (state === "logged_out" && this.requiresLogin)
        return unansweredResult(base(state), "logged_out", this.loggedOut().message);
      return unansweredResult(
        base(session),
        "failed",
        error instanceof Error ? error.message : "The answer could not be collected.",
      );
    }
  }

  /** Stops on a challenge, or on a sign-in wall when this engine needs a sign-in. */
  protected async checkpoint(page: EnginePage): Promise<ProbeResult> {
    const state = await this.probe(page);
    if (state === "captcha") throw this.blocked();
    if (state === "logged_out" && this.requiresLogin) throw this.loggedOut();
    return state;
  }

  /** Types the prompt into `selectors.input` and sends it with `selectors.submit` or Enter. */
  protected async typeAndSubmit(page: EnginePage, prompt: string, ctx: EngineContext) {
    const { input, submit } = this.selectors;
    if (!input) throw new Error(`${this.label} has no prompt input selector.`);
    if (!(await this.waitFor(page, input, 15_000, ctx)))
      throw new Error(`${this.label}'s prompt box did not appear.`);
    await this.pause(ctx, 400, 1_200);
    await page.type(input, prompt);
    await this.pause(ctx, 300, 900);
    if (submit && (await this.waitFor(page, submit, 5_000, ctx))) await page.click(submit);
    else await page.press(input, "Enter");
  }

  /** Polls until a selector is visible; false on timeout. */
  protected async waitFor(
    page: EnginePage,
    selector: string,
    timeoutMs: number,
    ctx: EngineContext,
  ) {
    const until = ctx.now().getTime() + timeoutMs;
    for (;;) {
      if ((await page.run(inspect, { selectors: [selector] })).visible[0]) return true;
      if (ctx.now().getTime() >= until) return false;
      await ctx.sleep(Math.min(500, this.timing.pollMs));
    }
  }

  protected pause(ctx: EngineContext, minMs: number, maxMs: number) {
    return ctx.sleep(Math.round(minMs + ctx.random() * (maxMs - minMs)));
  }
  private blocked() {
    return new EngineStop(
      "blocked",
      `${this.label} is showing a CAPTCHA or bot check. Open it in your browser and complete it.`,
    );
  }
  private loggedOut() {
    return new EngineStop("logged_out", `Sign in to ${sites[this.site].label} in your browser.`);
  }
}

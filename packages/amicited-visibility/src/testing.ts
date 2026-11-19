import { VisibilityEngine, defaultTiming, type EngineContext } from "./engine.ts";
import type { AnswerSnapshot, EnginePage, PageScript, PageState } from "./page.ts";
import type { EngineId, RawAnswer } from "./result.ts";
import { challengeSelectors, sites, type SiteId } from "./sites.ts";

export interface FakeSite {
  /** The answer shown after the prompt is sent; none means no answer ever appears. */
  readonly answer?: RawAnswer;
  /** Reads during which the answer still streams. */
  readonly streamingReads?: number;
  readonly state?: "ok" | "captcha" | "logged_out" | "captcha_after_ask";
  readonly loggedIn?: boolean;
  readonly failNavigation?: boolean;
  /** Runs when the prompt is sent, e.g. to hold the answer until a test releases it. */
  readonly onSend?: () => Promise<void>;
}

const loggedOutMarkers = new Set<string>(Object.values(sites).map((s) => s.loggedOut));
const loggedInMarkers = new Set<string>(Object.values(sites).map((s) => s.loggedIn));
const challengeMarkers = new Set<string>(challengeSelectors);

/** A scripted page with no DOM, for tests and the dev evidence fixtures. */
export class FakePage implements EnginePage {
  readonly driver = "fake";
  readonly browser = "Test page";
  readonly log: string[] = [];
  private site: FakeSite;
  private url = "about:blank";
  private sent = false;
  private reads = 0;
  private closed = false;
  constructor(site: FakeSite) {
    this.site = site;
  }
  setSite(site: FakeSite) {
    this.site = site;
  }
  async goto(url: string) {
    this.log.push(`goto ${url}`);
    if (this.site.failNavigation) throw new Error("Navigation failed");
    this.url = url;
    this.sent = false;
    this.reads = 0;
  }
  async run<A, R>(script: PageScript<A, R>, arg: A): Promise<R> {
    if (script.name === "inspect") {
      const { selectors } = arg as { selectors: readonly string[] };
      const state: PageState = {
        url: this.url,
        title: "",
        visible: selectors.map((s) => this.visible(s)),
      };
      return state as R;
    }
    if (script.name === "readAnswer") {
      const answer = this.sent ? this.site.answer : undefined;
      const streaming = this.reads++ < (this.site.streamingReads ?? 0);
      const snapshot: AnswerSnapshot = answer
        ? {
            found: true,
            busy: streaming,
            text: streaming ? answer.text.slice(0, this.reads) : answer.text,
            links: answer.links.map((l) => ({ url: l.url, title: l.title ?? "" })),
          }
        : { found: false, busy: false, text: "", links: [] };
      return snapshot as R;
    }
    // Google Search reads the whole page and needs no prompt sent.
    if (script.name === "readGoogleSearch") {
      const answer = this.site.answer;
      const overview = answer && {
        text: answer.text,
        items: answer.links.map((l) => ({ kind: "link", url: l.url, label: l.title ?? "" })),
      };
      return { url: this.url, results: true, overview: overview ?? null, organic: [] } as R;
    }
    if (script.name === "rejectGoogleConsent") return "none" as R;
    return true as R;
  }
  async type(selector: string, text: string) {
    this.log.push(`type ${selector} ${text}`);
  }
  async press(selector: string) {
    await this.send(`press ${selector}`);
  }
  async click(selector: string) {
    await this.send(`click ${selector}`);
  }
  async close() {
    this.closed = true;
  }
  isClosed() {
    return this.closed;
  }
  private async send(entry: string) {
    this.log.push(entry);
    await this.site.onSend?.();
    this.sent = true;
  }
  private visible(selector: string) {
    const state = this.site.state ?? "ok";
    if (challengeMarkers.has(selector))
      return state === "captcha" || (state === "captcha_after_ask" && this.sent);
    if (loggedOutMarkers.has(selector)) return state === "logged_out";
    if (loggedInMarkers.has(selector)) return this.site.loggedIn ?? false;
    return !selector.includes("submit");
  }
}

/** An engine that impersonates a real engine id, so it can run through the whole tracking pipeline. */
export function fakeEngine(
  id: EngineId,
  options: { readonly site?: SiteId; readonly requiresLogin?: boolean } = {},
): VisibilityEngine {
  return new (class FakeEngine extends VisibilityEngine {
    readonly id = id;
    readonly site = options.site ?? "perplexity";
    readonly label = `Fake ${id}`;
    override readonly requiresLogin = options.requiresLogin ?? false;
    override readonly timing = {
      ...defaultTiming,
      answerTimeoutMs: 5_000,
      settleTimeoutMs: 10_000,
    };
    readonly selectors = { input: "#fake-input", answer: "#fake-answer", busy: "#fake-busy" };
    protected ask(page: EnginePage, prompt: string, ctx: EngineContext) {
      return this.typeAndSubmit(page, prompt, ctx);
    }
  })();
}

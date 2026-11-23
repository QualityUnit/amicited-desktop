import { EngineStop, VisibilityEngine, type EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";
import type { RawAnswer } from "../result.ts";
import { openGeminiSources, prepareGemini, readGeminiAnswer } from "./gemini.scripts.ts";

const geminiError =
  /something went wrong|encounter(?:ed|ing)? an error|an error (?:has )?occurred|reached your (?:daily )?limit|try (?:your request )?again later/i;

/**
 * Gemini answers signed-out visitors too, so a sign-in is optional. Every check opens a new
 * chat. Signed-out chats are not kept; signed in, a check uses a temporary chat when Gemini
 * offers one and otherwise appears in the user's Recent chats, which are never deleted.
 */
export class GeminiEngine extends VisibilityEngine {
  readonly id = "gemini";
  readonly label = "Gemini";
  readonly site = "google";
  override readonly requiresLogin = false;
  readonly selectors = {
    input: 'rich-textarea .ql-editor[contenteditable="true"]',
    submit: '[data-test-id="send-button-container"] .send-button button',
    // The usage-limit banner counts as an answer so the wait ends; `extract` reports it.
    answer:
      'model-response message-content .markdown, [data-test-id="inline-upgrade-banner-title"]',
    busy: 'model-response .markdown[aria-busy="true"]',
  };
  /** Selectors for the temporary chat switch, and the marker that proves it is on. */
  private readonly temporaryChat = {
    button: '[data-test-id="temp-chat-button"], button[aria-label="Temporary chat"]',
    active: '.temporary-chat-header, [data-test-id="temporary-chat-zero-state"]',
  };

  override entryUrl() {
    return "https://gemini.google.com/app";
  }

  protected async ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    const state = await this.prepare(page, ctx);
    if (state.signedIn && (await this.waitFor(page, this.temporaryChat.button, 2_000, ctx))) {
      await page.click(this.temporaryChat.button);
      await this.waitFor(page, this.temporaryChat.active, 3_000, ctx);
    }
    await this.typeAndSubmit(page, prompt, ctx);
  }

  /**
   * Waits for the prompt box, gets past the consent screen and stops on Google's sign-in
   * interstitial or Gemini's welcome page. Signed out with no cookie choice saved, it also waits
   * for the consent dialog, which opens seconds after the prompt box.
   */
  private async prepare(page: EnginePage, ctx: EngineContext) {
    for (let attempt = 0; ; attempt++) {
      // A page mid-navigation fails to run scripts, and so do accounts.google.com and
      // consent.google.com, which the connector has no access to.
      const state = await page
        .run(prepareGemini, { input: this.selectors.input })
        .catch(() => null);
      if (state?.step === "setup")
        throw new EngineStop(
          "failed",
          "Gemini asks the Google account signed in here to accept its terms first. Open gemini.google.com with that account and choose Use Gemini.",
        );
      if (state?.step === "ready" && !state.consentPending) return state;
      if (state?.step === "signin" || (!state && attempt >= 4))
        throw new EngineStop(
          "logged_out",
          "Google is showing a sign-in or consent page. Open gemini.google.com in your browser and finish it.",
        );
      // The prompt box check in `typeAndSubmit` reports a page that never got ready.
      if (attempt >= 4 && state) return state;
      await this.pause(ctx, 1_500, 2_500);
    }
  }

  protected override async extract(page: EnginePage): Promise<RawAnswer> {
    const chipSources = await page.run(openGeminiSources, { openMs: 1_500 });
    const answer = await page.run(readGeminiAnswer, { chipSources });
    if (!answer.text && answer.notice)
      throw new EngineStop("failed", `Gemini did not answer: ${answer.notice}`);
    if (!answer.text) throw new Error("Gemini's answer was empty.");
    // Gemini reports its own failures as a short answer with no sources.
    if (answer.links.length === 0 && answer.text.length < 300 && geminiError.test(answer.text))
      throw new Error(`Gemini did not answer: ${answer.text}`);
    return { text: answer.text, links: answer.links };
  }
}

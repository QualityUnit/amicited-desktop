import { EngineStop, VisibilityEngine, type EngineContext } from "../engine.ts";
import type { EnginePage } from "../page.ts";
import { cleanGoogleAnswer } from "./googleOverviews.ts";
import { rejectGoogleConsent } from "./googleOverviews.scripts.ts";

/** Google AI Mode. */
export class GoogleAiModeEngine extends VisibilityEngine {
  readonly id = "google";
  readonly label = "Google AI Mode";
  readonly site = "google";
  override readonly requiresLogin = false;
  // Hidden until fixed: answers keep Google's screen-reader markers in the page's language and
  // every source is an opaque google.com/goto link (end-to-end sweep, 2026-11-26).
  override readonly supported = false;
  readonly selectors = {
    // AI Mode's prompt box has no name; `q` is the search box it used to share.
    input: '[data-xid*="input-plate"] textarea, textarea[name="q"], input[name="q"]',
    answer: '[data-container-id="main-col"], [data-attrid="AIOverview"]',
    busy: '[aria-label="Stop"]',
  };
  readonly consent = {
    rejectField: 'input[name="set_eom"][value="true"]',
    rejectButton: "#W0wltc",
    dialog: true,
  } as const;
  override entryUrl() {
    return "https://www.google.com/search?udm=50";
  }
  protected override async extract(page: EnginePage, ctx: EngineContext) {
    return cleanGoogleAnswer(await super.extract(page, ctx));
  }
  /** Rejects cookies first: until a choice is saved, Google's consent dialog covers the prompt box. */
  protected async ask(page: EnginePage, prompt: string, ctx: EngineContext) {
    for (let attempt = 0; attempt < 5; attempt++) {
      // The full-page consent screen navigates away once answered, and a read can fail mid-way.
      const consent = await page.run(rejectGoogleConsent, this.consent).catch(() => "clicked");
      if (consent === "none") return this.typeAndSubmit(page, prompt, ctx);
      if (consent === "missing") break;
      await this.pause(ctx, 1_000, 2_000);
    }
    throw new EngineStop(
      "blocked",
      "Google is asking you to accept or reject cookies. Open google.com in your browser and choose.",
    );
  }
}

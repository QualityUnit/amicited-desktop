import type { VisibilityEngine } from "../engine.ts";
import type { EngineId } from "../result.ts";
import { ChatGptEngine } from "./chatgpt.ts";
import { ClaudeEngine } from "./claude.ts";
import { GeminiEngine } from "./gemini.ts";
import { GoogleAiModeEngine } from "./google.ts";
import { GoogleOverviewsEngine } from "./googleOverviews.ts";
import { PerplexityEngine } from "./perplexity.ts";

export type EngineRegistry = Readonly<Record<EngineId, VisibilityEngine>>;
/** Adding an engine: one `VisibilityEngine` subclass, its id in `engineIds`, and one entry here. */
export const engines: EngineRegistry = {
  chatgpt: new ChatGptEngine(),
  perplexity: new PerplexityEngine(),
  gemini: new GeminiEngine(),
  claude: new ClaudeEngine(),
  google: new GoogleAiModeEngine(),
  google_overviews: new GoogleOverviewsEngine(),
};

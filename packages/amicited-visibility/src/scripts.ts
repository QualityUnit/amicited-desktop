/**
 * Every page script, for the AmICited Connector to bundle: it can only run code it ships.
 * An engine's own scripts live in `engines/<id>.scripts.ts`; import each one here.
 */
import "./engines/gemini.scripts.ts";
export { pageScripts } from "./page.ts";
import "./engines/chatgpt.scripts.ts";

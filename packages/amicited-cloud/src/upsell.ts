import { friendlyAssistant, isUsefulResult } from "@amicited/tools-core";
export interface WinResult {
  id?: string;
  tool: string;
  status: string;
  output?: unknown;
  input?: unknown;
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}
export function whatYouAreMissing(result: WinResult) {
  if (!isUsefulResult(result)) return undefined;
  let checked: string;
  let missing: string;
  let teaser: string | undefined;
  if (result.tool === "ai.visibility.check") {
    const scope = record(record(result.output).scope);
    const assistants = Array.isArray(scope.assistants)
      ? scope.assistants.filter((v): v is string => typeof v === "string").map(friendlyAssistant)
      : [];
    const summary = record(record(result.output).summary);
    checked =
      typeof summary.mentioned === "number" && typeof summary.answered === "number"
        ? `${String(record(result.input).brand ?? "Your brand")} was named in ${summary.mentioned} of ${summary.answered} ${assistants.join(" and ") || "AI"} answers in this check.`
        : `You completed a one-time ${assistants.join(" and ") || "AI"} visibility check.`;
    teaser = ["ChatGPT", "Claude", "Perplexity", "Gemini"]
      .filter((name) => !assistants.includes(name))
      .join(" · ");
    if (teaser) teaser += " · not checked";
    missing =
      "With AmICited: ChatGPT, Perplexity, Gemini, Google AI Overviews and AI Mode, Copilot and Claude, tracked daily, in the countries you choose, with competitors, citation sources and history.";
  } else if (/audit/.test(result.tool)) {
    checked =
      "You completed a one-time site audit, including whether AI crawlers can read your site.";
    const score = record(result.output).score;
    if (typeof score === "number") checked += ` Your audit score was ${score}/100.`;
    missing =
      "AmICited shows whether ChatGPT, Perplexity, Gemini and Google AI Overviews actually cite you, every day, against your competitors.";
  } else if (/^content\./.test(result.tool)) {
    checked = "You completed a content task.";
    missing =
      "With AmICited: AI articles and citation-gap briefs to plan content around sources AI assistants cite.";
  } else return undefined;
  return {
    checked,
    missing,
    teaser,
    pricing: "7-day trial, then EUR 120/month Pro, cancel anytime",
  };
}
export interface UpsellPreferences {
  snoozedUntil?: number;
  dismissed?: boolean;
}
export function shouldOfferUpsell(
  result: WinResult,
  preferences: UpsellPreferences,
  sessionShown: boolean,
  now: number,
  connected = false,
) {
  return (
    !sessionShown &&
    promotionEligible(whatYouAreMissing(result) !== undefined, preferences, now, connected)
  );
}
export function promotionEligible(
  firstWin: boolean,
  preferences: UpsellPreferences,
  now: number,
  connected = false,
) {
  return firstWin && !connected && !preferences.dismissed && (preferences.snoozedUntil ?? 0) <= now;
}

export function snoozeUpsell(now: number): UpsellPreferences {
  return { snoozedUntil: now + 7 * 24 * 60 * 60 * 1000 };
}
export function dismissUpsell(): UpsellPreferences {
  return { dismissed: true };
}
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function createUpsellGate(storage: PreferenceStorage, session: PreferenceStorage) {
  const key = "amicited.cloud.upsell";
  const read = (): UpsellPreferences => {
    try {
      const raw = JSON.parse(storage.getItem(key) ?? "{}");
      return {
        dismissed: raw?.dismissed === true,
        snoozedUntil: typeof raw?.snoozedUntil === "number" ? raw.snoozedUntil : 0,
      };
    } catch {
      return {};
    }
  };
  return {
    eligible(firstWin: boolean, now: number, connected = false) {
      return promotionEligible(firstWin, read(), now, connected);
    },
    hidden() {
      return read().dismissed === true;
    },
    claim(result: WinResult, now: number, connected = false) {
      try {
        const claimed = session.getItem(key);
        if (
          result.id &&
          claimed === result.id &&
          shouldOfferUpsell(result, read(), false, now, connected)
        )
          return true;
        if (!shouldOfferUpsell(result, read(), claimed !== null, now, connected)) return false;
        session.setItem(key, result.id ?? "shown");
        return true;
      } catch {
        return false;
      }
    },
    snooze(now: number) {
      try {
        storage.setItem(key, JSON.stringify(snoozeUpsell(now)));
      } catch {
        /* Storage may be disabled by the browser. */
      }
    },
    restore() {
      storage.setItem(key, "{}");
    },
    dismiss() {
      try {
        storage.setItem(key, JSON.stringify(dismissUpsell()));
        return true;
      } catch {
        return false;
      }
    },
  };
}

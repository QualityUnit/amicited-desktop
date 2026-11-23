import { connectionCatalogue } from "@amicited/cloud-client/connections";
import { engineConnection, type TrackingEngine } from "@amicited/cloud-client/tracking";
import { plural } from "./visibilityFormat";

export function engineLabel(engine: string) {
  return (
    (
      {
        google: "Google AI Mode",
        google_overviews: "AI Overviews",
        gemini: "Gemini",
        chatgpt: "ChatGPT",
        perplexity: "Perplexity",
        claude: "Claude",
      } as Record<string, string>
    )[engine] ?? "AI app"
  );
}

const connectionLabel = (engine: TrackingEngine) => {
  const id = engineConnection(engine);
  return connectionCatalogue.find((c) => c.id === id)?.label ?? engineLabel(engine);
};

export interface FailureCopy {
  title: string;
  detail: string;
  action: { kind: "connections" | "run"; label: string } | null;
}

/**
 * What an unanswered check says and the one thing that fixes it. With `count` it describes a
 * group of checks in the status card; without, one prompt's check on its detail page.
 */
export function failureCopy(
  status: string,
  engine: TrackingEngine,
  reason: string | undefined,
  context: { count?: number; when?: string; time?: string } = {},
): FailureCopy {
  const label = engineLabel(engine);
  const { count, when = "today", time = "" } = context;
  if (status === "needs_sign_in")
    return {
      title: `${label} needs your sign-in.`,
      detail:
        count === undefined
          ? `It was signed out when this prompt was asked ${when}.`
          : `${plural(count, "check")} waited for it. Sign in again in Connections.`,
      action: {
        kind: "connections",
        label: count === undefined ? "Sign in again in Connections" : "Connect",
      },
    };
  if (status === "blocked")
    return {
      title: `${connectionLabel(engine)} asked for a CAPTCHA.`,
      detail: "Complete it in Connections, then run the check again.",
      action: { kind: "connections", label: "Open Connections" },
    };
  if (status === "budget_exhausted")
    return {
      title: "Today's 20 free prompts were already used.",
      detail:
        count === undefined
          ? `This prompt is asked again tomorrow at ${time}.`
          : `The remaining ${plural(count, "check")} run tomorrow.`,
      action: null,
    };
  return {
    title:
      count === undefined
        ? `${label} could not be checked ${when}.`
        : `${plural(count, "check")} could not run on ${label}.`,
    detail: reason ?? "Running the check again usually fixes it.",
    action: { kind: "run", label: "Run again" },
  };
}

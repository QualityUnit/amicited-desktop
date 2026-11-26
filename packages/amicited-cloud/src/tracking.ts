import { timezoneCountries } from "./timezoneCountries.ts";
import { answerSchema } from "@amicited/tools/visibility-schema";
import { engines } from "@amicited/visibility/engines";
import {
  BrandMention,
  DomainMention,
  EngineId,
  engineIds,
  SearchResults,
  Source,
  type VisibilityResult,
} from "@amicited/visibility/result";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import { DomainVisibility } from "./visibility.ts";
export const TrackingEngine = EngineId;
const engineLabels = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  claude: "Claude",
  google: "Google AI Mode",
  google_overviews: "Google AI Overviews",
};
export type TrackingEngine = typeof TrackingEngine.Type;
export function engineConnection(engine: TrackingEngine) {
  return engines[engine].site;
}
/** Whether tracking this engine waits for the user to connect its site. */
export function engineNeedsConnect(engine: TrackingEngine) {
  return engines[engine].requiresLogin;
}
/** Engines the app offers; the others stay in the schema so saved answers still decode. */
export const supportedEngines: readonly TrackingEngine[] = engineIds.filter(
  (engine) => engines[engine].supported,
);
/** Engines that answer signed out are on by default; the rest need their site connected. */
export function availableEngines(
  connections: readonly { readonly id: string; readonly status: string }[],
): TrackingEngine[] {
  return supportedEngines.filter(
    (engine) =>
      !engineNeedsConnect(engine) ||
      connections.some((c) => c.id === engineConnection(engine) && c.status === "connected"),
  );
}
export class TrackingFailure extends Schema.TaggedError<TrackingFailure>()("TrackingFailure", {
  message: Schema.String,
}) {}
export const TrackedPrompt = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  enabled: Schema.Boolean,
  created: Schema.String,
});
export const TrackingConfig = Schema.Struct({
  threadId: Schema.optionalKey(Schema.String),
  projectId: Schema.String,
  country: Schema.String,
  time: Schema.String.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/)),
  engines: Schema.Array(TrackingEngine),
  prompts: Schema.Array(TrackedPrompt),
});
export type TrackingConfig = typeof TrackingConfig.Type;
export const TrackingAnswer = Schema.Struct({
  ...answerSchema.fields,
  promptId: Schema.String,
  engine: TrackingEngine,
  status: Schema.Literals(["answered", "needs_sign_in", "blocked", "failed", "budget_exhausted"]),
  excerpt: Schema.String,
  mentioned: Schema.Boolean,
  position: Schema.NullOr(Schema.Number),
  competitorsMentioned: Schema.Array(Schema.String),
  citations: Schema.Array(Schema.String),
  // Added with the engine base; answers saved before it lack them.
  text: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  capturedAt: Schema.optionalKey(Schema.String),
  country: Schema.optionalKey(Schema.String),
  sources: Schema.optionalKey(Schema.Array(Source)),
  brand: Schema.optionalKey(BrandMention),
  domain: Schema.optionalKey(DomainMention),
  search: Schema.optionalKey(SearchResults),
  webSearch: Schema.optionalKey(Schema.Boolean),
  /** Which browser captured the answer: the user's own, or the AmICited browser. */
  browser: Schema.optionalKey(Schema.String),
});
export type TrackingAnswer = typeof TrackingAnswer.Type;
const DatedAnswer = Schema.Struct({ day: Schema.String, answer: TrackingAnswer });
/** One prompt's last 30 days on this computer, for its detail page. */
export const PromptHistory = Schema.Struct({
  projectId: Schema.String,
  promptId: Schema.String,
  /** The same window as DomainVisibility. */
  from: Schema.String,
  to: Schema.String,
  /** One entry per day and engine that had a check; days without one are absent. */
  history: Schema.Array(
    Schema.Struct({
      day: Schema.String,
      engine: TrackingEngine,
      status: TrackingAnswer.fields.status,
      mentioned: Schema.Boolean,
      position: Schema.NullOr(Schema.Number),
      cited: Schema.Boolean,
      reason: Schema.optionalKey(Schema.String),
    }),
  ),
  /** Per engine: the newest check of any status, in full. */
  latest: Schema.Array(DatedAnswer),
  /** Per engine whose newest check is not an answer: the newest answered one, in full. */
  lastAnswered: Schema.Array(DatedAnswer),
});
export type PromptHistory = typeof PromptHistory.Type;
export const TrackingRun = Schema.Struct({
  id: Schema.String,
  engines: Schema.optionalKey(Schema.Array(TrackingEngine)),
  fixes: Schema.optionalKey(Schema.Array(Schema.String)),
  fixesSource: Schema.optionalKey(Schema.Literals(["assistant", "template"])),
  fixesLabel: Schema.optionalKey(Schema.String),
  reconnectAttempts: Schema.optionalKey(Schema.Array(Schema.String)),
  configKey: Schema.optionalKey(Schema.String),
  threadId: Schema.optionalKey(Schema.String),
  outcome: Schema.optionalKey(Schema.Literals(["ok", "partial", "failed"])),
  answered: Schema.optionalKey(Schema.Number),
  visibility: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  projectId: Schema.String,
  day: Schema.String,
  status: Schema.Literals(["running", "complete", "missed", "interrupted", "stopped"]),
  total: Schema.Number,
  answers: Schema.Array(TrackingAnswer),
});
export type TrackingRun = typeof TrackingRun.Type;
export const TrackingUsage = Schema.Struct({
  configured: Schema.optionalKey(Schema.Number),
  askedToday: Schema.optionalKey(Schema.Number),
  consumed: Schema.optionalKey(Schema.Number),
  used: Schema.Number,
  limit: Schema.Number,
  domains: Schema.Array(
    Schema.Struct({
      projectId: Schema.String,
      hostname: Schema.String,
      workspaceId: Schema.String,
      count: Schema.Number,
    }),
  ),
});
export type TrackingUsage = typeof TrackingUsage.Type;
/** Whether a domain's local answers reached its AmICited workspace. */
export const TrackingSync = Schema.Struct({
  projectId: Schema.String,
  state: Schema.Literals([
    "synced",
    "pending",
    "not_linked",
    "signed_out",
    "no_plan",
    "no_credits",
    "no_edit_rights",
    "domain_missing",
    "unsupported",
    "offline",
    "error",
  ]),
  message: Schema.String,
  lastSyncedAt: Schema.NullOr(Schema.String),
  pending: Schema.Number,
  /** Answers the cloud refused for good, such as a prompt over the plan's cap. */
  skipped: Schema.Number,
  /** Prompts the workspace's plan has no room for, so the dashboard never shows them. */
  overLimit: Schema.optionalKey(Schema.Number),
});
export type TrackingSync = typeof TrackingSync.Type;
export const TrackingSnapshot = Schema.Struct({
  sync: Schema.optionalKey(Schema.Array(TrackingSync)),
  dismissals: Schema.optionalKey(Schema.Array(Schema.String)),
  country: Schema.String,
  configs: Schema.Array(TrackingConfig),
  runs: Schema.Array(TrackingRun),
  usage: TrackingUsage,
});
export type TrackingSnapshot = typeof TrackingSnapshot.Type;
export const SaveTrackingResult = Schema.Union([
  Schema.Struct({ status: Schema.Literal("saved") }),
  Schema.Struct({ status: Schema.Literal("limit_reached"), usage: TrackingUsage }),
  Schema.Struct({ status: Schema.Literal("cloud") }),
]);
export type SaveTrackingResult = typeof SaveTrackingResult.Type;
export const trackingRpcs = [
  Rpc.make("amicited.tracking.subscribe", {
    success: TrackingSnapshot,
    error: TrackingFailure,
    stream: true,
  }),
  Rpc.make("amicited.tracking.detail", {
    payload: {
      runId: Schema.optionalKey(Schema.String),
      threadId: Schema.optionalKey(Schema.String),
    },
    success: Schema.NullOr(TrackingRun),
    error: TrackingFailure,
  }),
  Rpc.make("amicited.tracking.visibility", {
    payload: { projectId: Schema.optionalKey(Schema.String) },
    success: Schema.Array(DomainVisibility),
    error: TrackingFailure,
  }),
  Rpc.make("amicited.tracking.prompt", {
    payload: { projectId: Schema.String, promptId: Schema.String },
    success: PromptHistory,
    error: TrackingFailure,
  }),
  Rpc.make("amicited.tracking.save", {
    payload: { config: TrackingConfig, replacePromptId: Schema.optionalKey(Schema.String) },
    success: SaveTrackingResult,
    error: TrackingFailure,
  }),
  Rpc.make("amicited.tracking.suggest", {
    payload: { projectId: Schema.String, category: Schema.String },
    success: Schema.Array(Schema.String),
    error: TrackingFailure,
  }),
  Rpc.make("amicited.tracking.dismiss", {
    payload: { key: Schema.String, mode: Schema.Literals(["later", "dismiss", "restore"]) },
    success: Schema.Void,
    error: TrackingFailure,
  }),
  Rpc.make("amicited.tracking.checkMissing", {
    payload: { runId: Schema.String },
    success: Schema.String,
    error: TrackingFailure,
  }),
  Rpc.make("amicited.tracking.run", {
    payload: {
      projectId: Schema.String,
      threadId: Schema.optionalKey(Schema.String),
      stop: Schema.optionalKey(Schema.Boolean),
    },
    success: Schema.String,
    error: TrackingFailure,
  }),
];
export function detectCountry(
  locale = Intl.DateTimeFormat().resolvedOptions().locale,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  void locale;
  return timezoneCountries[timezone] ?? "ZZ";
}
const statuses = {
  answered: "answered",
  logged_out: "needs_sign_in",
  blocked: "blocked",
  failed: "failed",
} as const;
/** Stores an engine result as a tracking answer; the legacy fields stay for older clients. */
export function trackingAnswer(
  promptId: string,
  result: VisibilityResult,
  browser?: string,
): TrackingAnswer {
  return {
    promptId,
    prompt: result.prompt,
    engine: result.engine,
    status: statuses[result.status],
    excerpt: result.text.slice(0, 2000),
    mentioned: result.brand.mentioned || result.domain.mentioned,
    position: result.brand.listPosition,
    competitorsMentioned: result.competitors,
    citations: result.sources.map((s) => s.url),
    text: result.text.slice(0, 20_000),
    ...(result.reason ? { reason: result.reason } : {}),
    capturedAt: result.capturedAt,
    country: result.country,
    sources: result.sources,
    brand: result.brand,
    domain: result.domain,
    ...(result.search ? { search: result.search } : {}),
    ...(result.webSearch === undefined ? {} : { webSearch: result.webSearch }),
    ...(browser ? { browser } : {}),
  };
}
export function trackingFindings(
  answers: readonly TrackingAnswer[],
  previous: readonly TrackingAnswer[],
) {
  const findings = answers.flatMap<{
    questions: string[];
    fingerprint: string;
    report: string;
    effort: "small";
    kind: "connect" | "fix";
    priority: "high" | "medium";
    title: string;
    body: string;
  }>((a) => {
    const old = previous.find((p) => p.promptId === a.promptId && p.engine === a.engine);
    const base = {
      questions: [a.prompt],
      fingerprint: `tracking:${a.engine}:${old?.mentioned ? "dropped" : "competitor"}`,
      report: "AI visibility",
      effort: "small" as const,
    };
    if (a.status === "needs_sign_in" || a.status === "blocked") {
      const connection = engineConnection(a.engine);
      const labels: Record<string, string> = {
        google: "Google",
        chatgpt: "ChatGPT",
        claude: "Claude",
        perplexity: "Perplexity",
      };
      const label = labels[connection] ?? connection;
      return [
        {
          ...base,
          kind: "connect" as const,
          priority: "high" as const,
          fingerprint: `tracking:connection:${connection}`,
          title:
            a.status === "blocked"
              ? `${label} asks you to complete a CAPTCHA`
              : `${label} needs your sign-in`,
          body: a.prompt,
        },
      ];
    }
    if (a.status !== "answered" || a.mentioned) return [];
    if (!old?.mentioned && !a.competitorsMentioned.length) return [];
    return [
      {
        ...base,
        kind: "fix" as const,
        priority: old?.mentioned ? ("high" as const) : ("medium" as const),
        title: old?.mentioned
          ? `Visibility dropped on ${engineLabels[a.engine]}`
          : `${engineLabels[a.engine]} recommends ${a.competitorsMentioned[0]} instead`,
        body: a.prompt,
      },
    ];
  });
  const groups = new Map<string, (typeof findings)[number]>();
  for (const finding of findings) {
    const group = groups.get(finding.fingerprint);
    if (group) group.questions.push(...finding.questions);
    else groups.set(finding.fingerprint, { ...finding });
  }
  return [...groups.values()].map((f) => {
    const questions = [...new Set(f.questions)];
    return {
      ...f,
      questions,
      affectedPromptCount: questions.length,
      body: `${questions.length} affected prompts:\n${questions.join("\n")}`,
    };
  });
}

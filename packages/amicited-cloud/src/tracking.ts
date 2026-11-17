import { answerSchema } from "@amicited/tools/visibility-schema";
import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
export const TrackingEngine = Schema.Literals([
  "chatgpt",
  "perplexity",
  "gemini",
  "claude",
  "google",
  "google_overviews",
]);
const engineLabels = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
  claude: "Claude",
  google: "Google AI Mode",
  google_overviews: "Google AI Overviews",
};
export type TrackingEngine = typeof TrackingEngine.Type;
export class TrackingFailure extends Schema.TaggedError<TrackingFailure>()("TrackingFailure", {
  message: Schema.String,
  fallback: Schema.optionalKey(Schema.Array(Schema.String)),
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
  status: Schema.Literals(["answered", "needs_sign_in", "failed"]),
  excerpt: Schema.String,
  mentioned: Schema.Boolean,
  position: Schema.NullOr(Schema.Number),
  competitorsMentioned: Schema.Array(Schema.String),
  citations: Schema.Array(Schema.String),
});
export type TrackingAnswer = typeof TrackingAnswer.Type;
export const TrackingRun = Schema.Struct({
  id: Schema.String,
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
export const TrackingSnapshot = Schema.Struct({
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
export function suggestPrompts(brand: string, category: string, hostname: string) {
  const topic = category.trim() || "tools in this category";
  return [
    `What are the best ${topic}?`,
    `Which ${topic} work best for small teams?`,
    `What are affordable ${topic}?`,
    `Which ${topic} are easiest to set up?`,
    `Compare the leading ${topic}.`,
    `Which ${topic} are best for growing businesses?`,
    `What should I look for when choosing ${topic}?`,
    `What are alternatives to ${brand}?`,
    `Is ${brand} a good choice?`,
    `What does ${hostname} offer compared with other ${topic}?`,
  ];
}
export function detectCountry(
  locale = Intl.DateTimeFormat().resolvedOptions().locale,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const zones: Record<string, string> = {
    "Europe/Vienna": "AT",
    "Europe/Paris": "FR",
    "Europe/Bratislava": "SK",
    "Europe/Prague": "CZ",
    "Europe/Berlin": "DE",
    "Europe/London": "GB",
    "America/New_York": "US",
    "America/Los_Angeles": "US",
  };
  void locale;
  return zones[timezone] ?? "ZZ";
}
export function scheduleDays(
  now: Date,
  time: string,
  lastDay: string | undefined,
  configuredDay?: string,
) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const day = local.toISOString().slice(0, 10);
  const due = local.toISOString().slice(11, 16) >= time && day !== lastDay;
  const missed: string[] = [];
  if (lastDay ?? configuredDay) {
    const cursor = new Date(`${lastDay ?? configuredDay}T12:00:00Z`);
    if (lastDay) cursor.setUTCDate(cursor.getUTCDate() + 1);
    while (cursor.toISOString().slice(0, 10) < day && missed.length < 366) {
      missed.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return { day, due, missed };
}
export function parseAnswer(
  text: string,
  links: readonly string[],
  brand: string,
  hostname: string,
) {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mention = new RegExp(
    `(^|[^\\p{L}\\p{N}])(?:${[brand, hostname].filter(Boolean).map(escape).join("|")})(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  );
  const lines = text.split("\n");
  const listed = lines.filter((l) => /^\s*(?:\d+[.)]|[-*])\s/.test(l));
  const index = listed.findIndex((l) => mention.test(l));
  const numbered = index < 0 ? null : /^\s*(\d+)[.)]/.exec(listed[index]!)?.[1];
  const citations = [
    ...new Set(
      links.flatMap((link) => {
        try {
          const u = new URL(link);
          return /^https?:$/.test(u.protocol) ? [u.href] : [];
        } catch {
          return [];
        }
      }),
    ),
  ];
  return {
    excerpt: text.slice(0, 2000),
    mentioned: mention.test(text),
    position: index < 0 ? null : numbered ? Number(numbered) : index + 1,
    competitorsMentioned: [
      ...new Set(
        listed
          .filter((l) => !mention.test(l))
          .flatMap((l) => {
            const name =
              /^\s*(?:\d+[.)]|[-*])\s+(?:\*\*)?([\p{L}\p{N}][\p{L}\p{N} .&-]{1,60}?)(?:\*\*|:| – | — |$)/u
                .exec(l)?.[1]
                ?.trim();
            return name ? [name] : [];
          }),
      ),
    ],
    citations,
  };
}
export function trackingFindings(
  answers: readonly TrackingAnswer[],
  previous: readonly TrackingAnswer[],
) {
  const seenConnections = new Set<string>();
  return answers.flatMap<{
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
      fingerprint: `tracking:${a.engine}:${a.promptId}`,
      report: "AI visibility",
      effort: "small" as const,
    };
    if (a.status === "needs_sign_in") {
      const connection = ["gemini", "google_overviews"].includes(a.engine) ? "google" : a.engine;
      if (seenConnections.has(connection)) return [];
      seenConnections.add(connection);
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
          title: `${label} needs your sign-in`,
          body: "Sign in again in Connections, then run the missing questions.",
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
        body: `${a.excerpt}\n\nReview the answer and draft a page addressing this question before publishing.`,
      },
    ];
  });
}

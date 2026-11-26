import type { TrackingAnswer, TrackingEngine } from "./tracking.ts";

/** The cloud's provider ids; FlowHunt `submit_local_results` accepts only these. */
const cloudEngines = {
  perplexity: "perplexity",
  google_overviews: "google_ai_overview",
  gemini: "gemini",
  chatgpt: "chatgpt",
} as const satisfies Partial<Record<TrackingEngine, string>>;
type CloudEngine = (typeof cloudEngines)[keyof typeof cloudEngines];

const cloudStatuses = {
  answered: "answered",
  needs_sign_in: "logged_out",
  blocked: "blocked",
  failed: "failed",
} as const;

interface Link {
  url: string;
  title: string;
  position: number;
}
export interface LocalResult {
  prompt: string;
  engine: CloudEngine;
  country: string;
  checked_at: string;
  status: (typeof cloudStatuses)[keyof typeof cloudStatuses];
  reason: string | null;
  answer?: string;
  sources?: Link[];
  organic_results?: Link[];
  brand?: { mentioned: boolean; position: number | null };
  domain?: { mentioned: boolean };
  competitors?: { name: string; position: number | null }[];
}

const DAY = 86_400_000;
/** The cloud refuses checks older than this, and never reopens a day it has pruned. */
export const SYNC_WINDOW_MS = 14 * DAY;
export const SYNC_BATCH = 100;

const links = (rows: readonly { url: string; title: string; position: number }[]) =>
  rows
    .filter((r) => r.url.length <= 2048)
    .slice(0, 100)
    .map((r) => ({ url: r.url, title: r.title.slice(0, 500), position: r.position }));

/** Ranks the brand and competitors by where the answer first names them, 1 = first. */
function brandRanks(text: string, brand: string | null, competitors: readonly string[]) {
  const lower = text.toLowerCase();
  const found = [...(brand ? [brand] : []), ...competitors]
    .map((name) => ({ name, at: lower.indexOf(name.toLowerCase()) }))
    .filter((n) => n.at >= 0)
    .toSorted((a, b) => a.at - b.at);
  return (name: string) => {
    const rank = found.findIndex((n) => n.name === name);
    return rank < 0 ? null : rank + 1;
  };
}

/**
 * One tracking answer in the cloud's local-results shape, or null when the cloud
 * cannot take it: engines it does not check (Google AI Mode, Claude), prompts the
 * daily budget skipped, and answers saved before the engine base recorded a time.
 */
export function localResult(answer: TrackingAnswer, brand: string): LocalResult | null {
  const engine = (cloudEngines as Partial<Record<TrackingEngine, CloudEngine>>)[answer.engine];
  const prompt = answer.prompt.trim();
  const country = answer.country?.toUpperCase();
  if (
    !engine ||
    answer.status === "budget_exhausted" ||
    !answer.capturedAt ||
    Number.isNaN(Date.parse(answer.capturedAt)) ||
    !prompt ||
    prompt.length > 2000 ||
    !country ||
    !/^[A-Z]{2}$/.test(country) ||
    country === "ZZ"
  )
    return null;
  const base = {
    prompt,
    engine,
    country,
    checked_at: new Date(answer.capturedAt).toISOString(),
    status: cloudStatuses[answer.status],
  };
  if (answer.status !== "answered")
    return {
      ...base,
      reason: (answer.reason ?? "The answer could not be collected.").slice(0, 1000),
    };
  const text = answer.text ?? answer.excerpt;
  const competitors = [...new Set(answer.competitorsMentioned)]
    .filter((name) => name.trim() && name.length <= 200)
    .slice(0, 50);
  const mentioned = answer.brand?.mentioned ?? answer.mentioned;
  const rank = brandRanks(text, mentioned ? brand : null, competitors);
  return {
    ...base,
    reason: null,
    answer: text,
    sources: links(answer.sources ?? []),
    ...(engine === "google_ai_overview"
      ? { organic_results: links(answer.search?.organic ?? []) }
      : {}),
    brand: { mentioned, position: mentioned ? (rank(brand) ?? answer.position ?? null) : null },
    domain: { mentioned: answer.domain?.mentioned ?? false },
    competitors: competitors.map((name) => ({ name, position: rank(name) })),
  };
}

/** The cloud keeps one result per prompt, engine, country and UTC day; so does the outbox. */
export function localResultKey(result: LocalResult) {
  return [
    result.engine,
    result.country,
    result.checked_at.slice(0, 10),
    result.prompt.toLowerCase(),
  ].join("|");
}

/** Waits 1, 2, 4… minutes between failed attempts, up to six hours. */
export function syncBackoff(attempts: number) {
  return Math.min(6 * 3_600_000, 60_000 * 2 ** Math.max(0, attempts));
}

export type ItemDisposition =
  | { state: "done"; outcome: string }
  | { state: "dropped"; outcome: string; stopPrompt: boolean }
  | { state: "pending"; outcome: string; at: number };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

/** What to do with one item after the cloud answered for it. */
export function itemDisposition(outcome: unknown, now: number, attempts: number): ItemDisposition {
  const o = record(outcome);
  const result = typeof o.outcome === "string" ? o.outcome : "";
  const code = typeof o.error_code === "string" ? o.error_code : result || "missing";
  if (["created", "updated", "unchanged"].includes(result))
    return { state: "done", outcome: result };
  if (result === "retry_later" || code === "retry_later") {
    const seconds = Number(o.retry_after);
    return {
      state: "pending",
      outcome: "retry_later",
      at: now + (Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : syncBackoff(attempts)),
    };
  }
  if (code === "conflict" || code === "store_failed" || code === "missing")
    return { state: "pending", outcome: code, at: now + syncBackoff(attempts) };
  // invalid_checked_at, too_old, prompt_limit_reached and any code this client does not know.
  return { state: "dropped", outcome: code, stopPrompt: code === "prompt_limit_reached" };
}

/** Why a whole upload was refused; the outbox pauses the domain instead of resending. */
export type SyncProblem =
  | "signed_out"
  | "no_plan"
  | "no_credits"
  | "no_edit_rights"
  | "domain_missing"
  | "unsupported"
  | "malformed"
  | "pass_invalid"
  | "offline"
  | "error";

export const syncMessages: Record<SyncProblem | "not_linked", string> = {
  not_linked: "Not synced: add this website to your AmICited workspace first.",
  signed_out: "Not synced: sign in to this workspace again.",
  no_plan: "Not synced: syncing to AmICited needs a plan or trial. Answers stay on this computer.",
  no_credits: "Not synced: this workspace is out of AmICited credits.",
  no_edit_rights:
    "Not synced: your role can't add results to this workspace. Ask an owner, admin or editor.",
  domain_missing: "Not synced: AmICited no longer has this website.",
  unsupported: "Not synced: AmICited doesn't accept desktop results yet.",
  malformed: "Some answers could not be synced.",
  pass_invalid: "Not synced: AmICited refused today's sync pass. Retrying.",
  offline: "Not synced: AmICited can't be reached. Retrying.",
  error: "Not synced: AmICited refused the upload. Retrying.",
};

/** Classifies a refused upload: a tool error result, or the message of a thrown transport error. */
export function syncProblem(failure: unknown): SyncProblem {
  if (typeof failure === "string")
    return /authentication required|sign in|session/i.test(failure) ? "signed_out" : "offline";
  const data = record(record(failure).structuredContent);
  const message = typeof data.message === "string" ? data.message : "";
  if (/unknown tool|tool .*not found/i.test(message)) return "unsupported";
  if (/day pass is invalid or expired/i.test(message)) return "pass_invalid";
  if (/no active subscription plan/i.test(message)) return "no_plan";
  if (/payment limit|insufficient credits/i.test(message)) return "no_credits";
  switch (data.code) {
    case "plan_required":
      return "no_plan";
    case "no_credits":
      return "no_credits";
    case "scope_missing":
      return "no_edit_rights";
    case "not_found":
      return "domain_missing";
    case "rate_limited":
      return "error";
  }
  if (/permission|not authorized|forbidden/i.test(message)) return "no_edit_rights";
  if (/validation|field required|invalid|unprocessable|extra (?:inputs|fields)/i.test(message))
    return "malformed";
  return "error";
}

/** The per-item outcomes of a successful upload, in request order. */
export function uploadOutcomes(data: unknown): unknown[] | null {
  const body = record(data);
  const results = body.results ?? record(body.result).results;
  return Array.isArray(results) ? results : null;
}

import type { ResultStatus } from "./result.ts";

export interface Pacing {
  /** Random pause between any two asks. */
  readonly betweenAsksMs: readonly [number, number];
  /** Minimum time between two asks to the same site. */
  readonly sameSiteGapMs: number;
  /** Random pause before retrying a failed ask. */
  readonly retryAfterMs: readonly [number, number];
  /** Attempts per ask; only `failed` results are retried. */
  readonly attempts: number;
  /** Consecutive failures that stop a site for the rest of the run. */
  readonly maxSiteFailures: number;
}
export const defaultPacing: Pacing = {
  betweenAsksMs: [3_000, 8_000],
  sameSiteGapMs: 15_000,
  retryAfterMs: [20_000, 40_000],
  attempts: 2,
  maxSiteFailures: 2,
};

const between = ([min, max]: readonly [number, number], random: number) =>
  Math.round(min + random * (max - min));

/** Prompt-major order, so consecutive asks go to different engines. */
export function askOrder<P, E>(prompts: readonly P[], engines: readonly E[]) {
  return prompts.flatMap((prompt) => engines.map((engine) => ({ prompt, engine })));
}

export function retryDelay(status: ResultStatus, attempt: number, pacing: Pacing, random: number) {
  return status === "failed" && attempt < pacing.attempts
    ? between(pacing.retryAfterMs, random)
    : null;
}

/**
 * Per-run pacing and stop rules shared by every engine. A site stops for the run after
 * a CAPTCHA or sign-in wall, or after repeated failures, so a run never loops on a site
 * that needs the user.
 */
export class SitePacer<S extends string = string> {
  private readonly lastAsk = new Map<S, number>();
  private readonly failures = new Map<S, number>();
  private readonly stops = new Map<S, ResultStatus>();
  private readonly pacing: Pacing;
  constructor(pacing: Pacing = defaultPacing) {
    this.pacing = pacing;
  }
  /** Milliseconds to wait before the next ask to `site`. */
  delayBefore(site: S, now: number, random: number) {
    const last = this.lastAsk.get(site);
    const gap = last === undefined ? 0 : last + this.pacing.sameSiteGapMs - now;
    return Math.max(this.lastAsk.size ? between(this.pacing.betweenAsksMs, random) : 0, gap);
  }
  asked(site: S, at: number) {
    this.lastAsk.set(site, at);
  }
  /** The status that stopped `site`, if it is stopped. */
  stopped(site: S) {
    return this.stops.get(site) ?? null;
  }
  record(site: S, status: ResultStatus) {
    if (status === "blocked" || status === "logged_out") this.stops.set(site, status);
    if (status !== "failed") return this.failures.set(site, 0);
    const failures = (this.failures.get(site) ?? 0) + 1;
    this.failures.set(site, failures);
    if (failures >= this.pacing.maxSiteFailures) this.stops.set(site, "failed");
  }
}

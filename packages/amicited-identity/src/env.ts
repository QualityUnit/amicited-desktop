/**
 * AmICited reads `AMICITED_*` environment variables and never T3 Code's `T3CODE_*` ones.
 * Upstream code still reads `T3CODE_*`, so each top-level entry point calls
 * `applyAmicitedEnv` once, before anything reads the environment.
 */
import { ENV_PREFIX } from "./index.ts";

/** The prefix upstream T3 Code reads. A T3 user's shell may export these. */
export const UPSTREAM_ENV_PREFIX = "T3CODE_";

/**
 * Set after the mapping runs. Child processes inherit it, so the `T3CODE_*` values
 * the app sets for its own children (for example the desktop's backend port) survive.
 */
export const ENV_MAPPED_MARKER = `${ENV_PREFIX}ENV_MAPPED`;

type MutableEnv = Record<string, string | undefined>;

const hasPrefix = (key: string, prefix: string) => key.toUpperCase().startsWith(prefix);

/**
 * Drops inherited `T3CODE_*` variables and copies each `AMICITED_X` to `T3CODE_X`,
 * unless an AmICited parent process has already done so.
 */
export function applyAmicitedEnv(env: MutableEnv = process.env): void {
  if (env[ENV_MAPPED_MARKER] === "1") return;
  for (const key of Object.keys(env)) {
    if (hasPrefix(key, UPSTREAM_ENV_PREFIX)) delete env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    const upstream = toUpstreamEnvName(key);
    if (value !== undefined && upstream !== key) env[upstream] = value;
  }
  env[ENV_MAPPED_MARKER] = "1";
}

/** `AMICITED_X` → `T3CODE_X`; other names are returned unchanged. */
export function toUpstreamEnvName(name: string): string {
  return hasPrefix(name, ENV_PREFIX) && name !== ENV_MAPPED_MARKER
    ? `${UPSTREAM_ENV_PREFIX}${name.slice(ENV_PREFIX.length)}`
    : name;
}

/** `T3CODE_X` → `AMICITED_X`, for names shown to users or written to files they edit. */
export function toAmicitedEnvName(name: string): string {
  return hasPrefix(name, UPSTREAM_ENV_PREFIX)
    ? `${ENV_PREFIX}${name.slice(UPSTREAM_ENV_PREFIX.length)}`
    : name;
}

import { BUTTON_BASE } from "./cloud/buttonStyles.js";
// Cloud control geometry with AmICited surface tokens, for injected T3 kit variants.
export const MARKETING_CONTROL = `${BUTTON_BASE} h-8 gap-1.5 rounded-lg px-3 text-[13px] sm:text-[13px] font-medium shadow-none inset-shadow-none before:shadow-none`;
export const MARKETING_PRIMARY =
  "border-[var(--ai-accent)] bg-[var(--ai-accent)] text-[var(--ai-on-accent)] hover:bg-[color-mix(in_srgb,var(--ai-accent)_90%,black)]";
export const MARKETING_SECONDARY =
  "border-[var(--ai-surf-3)] bg-[var(--ai-surf)] text-[var(--ai-ink)] hover:bg-[var(--ai-bg)]";
export const MARKETING_LINK =
  "rounded px-0 border-transparent bg-transparent text-[var(--ai-accent)] hover:underline";

export const MARKETING_ROW = `${MARKETING_SECONDARY} h-auto min-h-16 justify-between whitespace-normal px-4 py-3 text-left`;

// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/dashboard/status/severityStyles.ts.

export const SEVERITY_BADGE_COLORS = {
  critical: "bg-ai-bad/10 text-ai-bad-ink hover:bg-ai-bad/10",
  warning: "bg-ai-warn/15 text-ai-warn-ink hover:bg-ai-warn/15",
} as const;

export const CRITICAL_TONE = {
  frame: "rounded-lg border-[color-mix(in_srgb,var(--ai-bad)_35%,transparent)]",
  header: "bg-[color-mix(in_srgb,var(--ai-bad)_6%,var(--ai-surf))]",
  divider: "border-[color-mix(in_srgb,var(--ai-bad)_20%,transparent)]",
} as const;

export const WARNING_TONE = {
  frame: "rounded-lg border-[color-mix(in_srgb,var(--ai-warn)_45%,transparent)]",
  header: "bg-[color-mix(in_srgb,var(--ai-warn)_6%,var(--ai-surf))]",
  divider: "border-[color-mix(in_srgb,var(--ai-warn)_30%,transparent)]",
} as const;

export const GOOD_TONE = {
  frame: "rounded-lg border-[color-mix(in_srgb,var(--ai-good)_35%,transparent)]",
  header: "bg-[color-mix(in_srgb,var(--ai-good)_8%,var(--ai-surf))]",
  divider: "border-[color-mix(in_srgb,var(--ai-good)_25%,transparent)]",
} as const;

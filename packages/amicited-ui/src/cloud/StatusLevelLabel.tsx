// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/dashboard/status/StatusLevelLabel.tsx.
import type { FC, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type StatusLevelTone = "bad" | "warn" | "good" | "muted";

const TONE_CLASS: Record<StatusLevelTone, string> = {
  bad: "text-[var(--ai-bad-ink)]",
  warn: "text-[var(--ai-warn-ink)]",
  good: "text-[var(--ai-good-ink)]",
  muted: "text-[var(--ai-ink-3)]",
};

export const StatusLevelLabel: FC<{
  tone: StatusLevelTone;
  className?: string;
  children: ReactNode;
}> = ({ tone, className, children }) => (
  <span
    className={twMerge(
      "font-[family-name:var(--font-ai-mono)] text-xs leading-4 font-medium tracking-[0.08em] whitespace-nowrap uppercase",
      TONE_CLASS[tone],
      className,
    )}
  >
    {children}
  </span>
);

// Ported from flowhunt2 origin/main 44d4019d4c: components/ui/Badge.tsx and tone.ts (small tint pills).
import type { ReactNode } from "react";
const tones = {
  pass: "bg-ui-good/14 text-ui-good-ink",
  fail: "bg-ui-bad/14 text-ui-bad-ink",
  warn: "bg-ui-warn/18 text-ui-warn-ink",
  unknown: "bg-ai-surf-2 text-ai-ink-2",
} as const;
export function Badge({ status, children }: { status: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-full h-4.5 px-2 text-caption am-badge ${tones[status === "pass" || status === "fail" || status === "warn" ? status : "unknown"]}`}
    >
      {children}
    </span>
  );
}

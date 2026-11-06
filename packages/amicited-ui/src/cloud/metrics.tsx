// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/dashboard/metrics/ui.tsx.
import type { FC, ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { CARD_FRAME } from "./cardFrame.js";
export const KpiStrip: FC<{ className?: string; children: ReactNode }> = ({
  className,
  children,
}) => (
  <div
    data-kpi-strip=""
    className={twMerge(
      CARD_FRAME,
      "grid grid-cols-2 gap-px overflow-hidden bg-[var(--ai-line)] sm:grid-cols-4",
      className,
    )}
  >
    {children}
  </div>
);

export interface StatRowItem {
  label: string;
  value: ReactNode;
  tone?: "good" | "bad";
}

export const StatRow: FC<{ items: StatRowItem[] }> = ({ items }) => (
  <dl className="grid grid-cols-3 gap-y-2 sm:flex sm:divide-x sm:divide-[var(--ai-line)]">
    {items.map((item) => (
      <div key={item.label} className="min-w-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">
        <dt className="truncate text-[11px] font-medium text-[var(--ai-ink-3)]">{item.label}</dt>
        <dd
          className={`font-[family-name:var(--font-ai-mono)] text-lg leading-tight font-semibold tabular-nums ${
            item.tone === "good"
              ? "text-[var(--ai-good)]"
              : item.tone === "bad"
                ? "text-[var(--ai-bad)]"
                : "text-[var(--ai-ink)]"
          }`}
        >
          {item.value}
        </dd>
      </div>
    ))}
  </dl>
);

interface KpiCellProps {
  label: ReactNode;
  value: ReactNode;

  sub?: ReactNode;
  className?: string;
}

export const KpiCell: FC<KpiCellProps> = ({ label, value, sub, className }) => (
  <div className={twMerge("min-w-0 bg-[var(--ai-surf)] px-4 py-3", className)}>
    <span className="block truncate text-xs font-medium text-[var(--ai-ink-3)]">{label}</span>
    <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
      <span className="font-[family-name:var(--font-ai-mono)] text-2xl font-semibold text-[var(--ai-ink)] tabular-nums">
        {value}
      </span>
      {sub ? (
        <span className="truncate text-xs font-medium text-[var(--ai-ink-3)]">{sub}</span>
      ) : null}
    </span>
  </div>
);

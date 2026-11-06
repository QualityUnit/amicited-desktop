// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/dashboard/metrics/ui.tsx.
import { Children, isValidElement, cloneElement, Fragment, type FC, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { CARD_FRAME } from "./cardFrame.js";
export const KpiStrip: FC<{ className?: string; children: ReactNode }> = ({
  className,
  children,
}) => {
  const flatten = (nodes: ReactNode, prefix = ""): ReactNode[] =>
    Children.toArray(nodes).flatMap((node) =>
      isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment
        ? flatten(node.props.children, `${prefix}${node.key}:`)
        : [isValidElement(node) ? cloneElement(node, { key: `${prefix}${node.key}` }) : node],
    );
  const cells = flatten(children);
  if (!cells.length) return null;
  const columns = ["", "sm:grid-cols-1", "sm:grid-cols-2", "sm:grid-cols-3", "sm:grid-cols-4"][
    Math.min(cells.length, 4)
  ];
  return (
    <div
      data-kpi-strip=""
      className={twMerge(
        CARD_FRAME,
        "grid grid-cols-1 gap-px overflow-hidden bg-[var(--ai-line)] ",
        cells.length % 2 === 0 && "grid-cols-2",
        columns,
        className,
      )}
    >
      {cells}
    </div>
  );
};

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
  <div className={twMerge("min-w-0 bg-[var(--ai-surf)] px-4 py-3 sm:px-5 sm:py-4", className)}>
    <span className="block truncate text-[13px] leading-5 text-[var(--ai-ink-2)]">{label}</span>
    <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
      <span className="font-[family-name:var(--font-ai-mono)] text-[28px] leading-9 font-medium tracking-[-0.02em] text-[var(--ai-ink)] tabular-nums">
        {value}
      </span>
      {sub ? (
        <span className="truncate text-xs font-medium text-[var(--ai-ink-3)]">{sub}</span>
      ) : null}
    </span>
  </div>
);

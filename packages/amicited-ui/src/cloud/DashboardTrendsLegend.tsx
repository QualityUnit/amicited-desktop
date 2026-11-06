// Ported from flowhunt2 origin/main 44d4019d4c: dashboard/metrics/DashboardTrendsLegend.tsx.

import type { FC, ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { ROW_RULE_CLASS } from "./BarRow.js";
import { BrandFavicon } from "./TrendsSupport.js";
import type { LegendItem } from "./TrendsSupport.js";
import { SkeletonBlock, YouBadge } from "./TrendsSupport.js";

type LegendLayout = "viewport" | "dashboard";

const LEGEND_LAYOUT: Record<
  LegendLayout,
  {
    aside: string;
    wrap: string;
    head: string;
    title: string;
    empty: string;
    footer: string;
    you: "chip" | "own";
    list: string;
    row: string;
    label: string;
    value: string;
    divider: string;
  }
> = {
  viewport: {
    aside:
      "flex min-w-0 flex-col border-t border-[var(--ai-line)] xl:max-h-[560px] xl:overflow-hidden xl:border-t-0 xl:border-l",
    wrap: "contents",
    head: "flex items-center justify-between gap-2 px-4 pt-3.5 pb-2.5 sm:px-5",
    title: "text-sm leading-[18px] font-semibold text-[var(--ai-ink)]",
    empty: "px-4 py-5 sm:px-5",
    footer: "mt-auto border-t border-[var(--ai-line)] px-4 py-3 text-left sm:px-5",
    you: "chip",
    list: "max-h-80 overflow-y-auto border-t border-[var(--ai-line)] xl:max-h-[420px]",
    row: "flex w-full min-w-0 items-center gap-2 px-4 py-[9px] text-left sm:px-5",
    label: "min-w-0 flex-1 truncate text-sm leading-[18px] text-[var(--ai-ink)]",
    value:
      "shrink-0 font-[family-name:var(--font-ai-mono)] text-[13px] leading-[normal] text-[var(--ai-ink)] tabular-nums",
    divider: twMerge("border-b last:border-b-0", ROW_RULE_CLASS),
  },
  dashboard: {
    aside:
      "relative min-w-0 border-t border-[var(--ai-line)] @5xl/dashboard:border-t-0 @5xl/dashboard:border-l",
    wrap: "flex min-h-0 flex-col @5xl/dashboard:absolute @5xl/dashboard:inset-0",
    head: "flex items-center justify-between gap-2 px-5 pt-3.5 pb-2.5 max-sm:px-4 max-sm:pt-3 max-sm:pb-2",
    title: "text-sm leading-[18px] font-semibold text-[var(--ai-ink)]",
    empty: "px-5 py-5 max-sm:px-4",
    footer: "mt-auto border-t border-[var(--ai-line)] px-5 py-3 text-left max-sm:px-4",
    you: "chip",
    list: "max-h-80 overflow-y-auto border-t border-[var(--ai-line)] max-sm:flex max-sm:max-h-none max-sm:flex-col max-sm:gap-2 max-sm:border-t-0 max-sm:px-4 max-sm:pb-2.5 @5xl/dashboard:max-h-none @5xl/dashboard:min-h-0 @5xl/dashboard:flex-1",
    row: "flex w-full min-w-0 items-center gap-2 px-5 py-[9px] text-left max-sm:px-0 max-sm:py-0",
    label:
      "min-w-0 flex-1 truncate text-sm leading-[18px] text-[var(--ai-ink)] max-sm:text-[13px] max-sm:leading-[normal]",
    value:
      "shrink-0 font-[family-name:var(--font-ai-mono)] text-[13px] leading-[normal] text-[var(--ai-ink)] tabular-nums",
    divider: twMerge("border-b last:border-b-0 max-sm:border-b-0", ROW_RULE_CLASS),
  },
};

interface DashboardTrendsLegendProps {
  layout?: LegendLayout;
  title: string;
  subtitle?: string;

  valueLabel?: string;
  items: LegendItem[];

  footer?: ReactNode;

  loading?: boolean;
  loadingClassName?: string;

  emptyLabel?: string;

  valueWidthClassName?: string;
}

// Two-figure rows give each figure its own fixed column so they line up.
const VALUE_COLUMN_CLASS = "text-right";
const DETAIL_COLUMN_CLASS =
  "w-14 shrink-0 text-right font-[family-name:var(--font-ai-mono)] text-[13px] leading-[normal] text-[var(--ai-ink-3)] tabular-nums";

export const DashboardTrendsLegend: FC<DashboardTrendsLegendProps> = ({
  layout = "viewport",
  title,
  subtitle,
  valueLabel,
  items,
  footer,
  loading = false,
  loadingClassName,
  emptyLabel,
  valueWidthClassName = "w-14",
}) => {
  const L = LEGEND_LAYOUT[layout];
  const hasDetail = items.some((item) => item.detail !== undefined);

  return (
    <aside className={L.aside}>
      <div className={L.wrap}>
        <div className={L.head}>
          <div className="min-w-0">
            <h2 className={L.title}>{title}</h2>
            {subtitle ? <p className="mt-1 text-xs text-[var(--ai-ink-3)]">{subtitle}</p> : null}
          </div>
          {valueLabel ? (
            <span className="shrink-0 text-xs text-[var(--ai-ink-3)]">{valueLabel}</span>
          ) : null}
        </div>
        {loading ? (
          <div className="px-5 pb-4 max-sm:px-4">
            <SkeletonBlock inset className={loadingClassName} />
          </div>
        ) : items.length === 0 ? (
          <p
            className={twMerge(
              "border-t border-[var(--ai-line)] text-sm text-[var(--ai-ink-3)]",
              L.empty,
            )}
          >
            {emptyLabel ?? "No brands in this check"}
          </p>
        ) : (
          <div className={L.list} role="list">
            {items.map((item) => {
              const row = (
                <>
                  {item.color ? (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: item.color }}
                    />
                  ) : null}

                  {item.icon ? (
                    item.icon
                  ) : item.domain ? (
                    <BrandFavicon domain={item.domain} size={18} className="max-sm:size-4!" />
                  ) : null}
                  <span className={L.label}>{item.label}</span>
                  {item.you ? (
                    L.you === "chip" ? (
                      <YouBadge variant="chip" label={"you"} />
                    ) : (
                      <span className="text-ai-on-accent rounded bg-[var(--ai-accent)] px-1 py-px text-[9px] font-medium">
                        {"you"}
                      </span>
                    )
                  ) : null}
                  <span
                    className={twMerge(
                      L.value,
                      hasDetail && VALUE_COLUMN_CLASS,
                      hasDetail && valueWidthClassName,
                      item.muted && "opacity-60",
                    )}
                  >
                    {item.value}
                  </span>
                  {hasDetail ? <span className={DETAIL_COLUMN_CLASS}>{item.detail}</span> : null}
                </>
              );
              return (
                <div key={item.key} role="listitem" className={L.divider}>
                  {item.onSelect ? (
                    <button
                      type="button"
                      aria-pressed={item.active ?? false}
                      onClick={item.onSelect}
                      className={twMerge(
                        L.row,
                        item.active ? "bg-[var(--ai-surf-2)]" : "hover:bg-[var(--ai-surf-2)]",
                      )}
                    >
                      {row}
                    </button>
                  ) : (
                    <div className={L.row}>{row}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {footer ? <div className={L.footer}>{footer}</div> : null}
      </div>
    </aside>
  );
};

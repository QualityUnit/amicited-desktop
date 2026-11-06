// Ported from flowhunt2 origin/main 44d4019d4c: dashboard/metrics/DashboardTrendsTabs.tsx.

import { Text } from "./TrendsSupport.js";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import {
  Minus as TbMinus,
  TrendingDown as TbTrendingDown,
  TrendingUp as TbTrendingUp,
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import type { TabHeadline, TrendsTab } from "./TrendsSupport.js";
import { SkeletonBlock } from "./TrendsSupport.js";

interface DashboardTrendsTabsProps<T extends string> {
  tabs: { id: T; label: string }[];
  tab: T;
  headlines: Record<T, TabHeadline>;
  ariaLabel: string;
  onSelect: (next: T) => void;
  tabRefs: RefObject<Record<T, HTMLButtonElement | null>>;

  className?: string;
}

export const DashboardTrendsTabs = <T extends string = TrendsTab>({
  tabs,
  tab,
  headlines,
  ariaLabel,
  onSelect,
  tabRefs,
  className,
}: DashboardTrendsTabsProps<T>) => {
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const next = tabs[nextIndex]!.id;
    onSelect(next);
    tabRefs.current[next]?.focus();
  };

  // The tabs go four across by the strip's own width, not the window's, so a
  // card squeezed beside the agent panel keeps two readable columns.
  return (
    <div className="@container/kpi">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={twMerge(
          "grid grid-cols-2 border-b border-[var(--ai-line)] @xl/kpi:grid-cols-4",
          className,
        )}
      >
        {tabs.map((item, index) => {
          const selected = tab === item.id;
          const headline = headlines[item.id];
          return (
            <button
              key={item.id}
              id={`dashboard-trend-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="dashboard-trend-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => onSelect(item.id)}
              onKeyDown={(event) => moveFocus(event, index)}
              ref={(element) => {
                tabRefs.current[item.id] = element;
              }}
              className={`@container/tab relative flex min-w-0 flex-col justify-start px-3 py-2.5 text-left hover:bg-[var(--ai-surf-hover)] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ai-accent)] @xl/kpi:px-5 @xl/kpi:py-4 ${index >= 2 ? "border-t border-[var(--ai-line)] @xl/kpi:border-t-0" : ""} ${index % 2 !== 0 ? "border-l border-[var(--ai-line)]" : ""} ${tabs.length % 2 !== 0 && index === tabs.length - 1 ? "col-span-2 @xl/kpi:col-span-1" : ""} @xl/kpi:border-l @xl/kpi:first:border-l-0`}
            >
              <Text role="body" as="span" tone="ink-2" truncate className="block max-w-full">
                {item.label}
              </Text>
              {headline.loading ? (
                <SkeletonBlock inset className="mt-1.5 h-9 w-16" />
              ) : (
                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 @xl/kpi:mt-1.5">
                  <span className="flex flex-col items-start gap-y-0.5 @xl/kpi:flex-row @xl/kpi:flex-wrap @xl/kpi:items-baseline @xl/kpi:gap-x-1.5">
                    <span
                      style={
                        {
                          "--vfit": `${(100 / (headline.value.length * 0.6 + 0.2)).toFixed(2)}cqw`,
                        } as CSSProperties
                      }
                      className="font-[family-name:var(--font-ai-mono)] text-[length:max(11px,min(20px,var(--vfit)))] leading-[normal] font-medium tracking-[-0.02em] text-[var(--ai-ink)] tabular-nums @xl/kpi:text-[length:max(11px,min(28px,var(--vfit)))] @xl/kpi:leading-9"
                    >
                      {headline.value}
                    </span>
                    {headline.delta ? (
                      <span
                        data-testid={`trend-delta-${item.id}`}
                        aria-label={`${headline.deltaDirection ?? "neutral"}: ${headline.delta}`}
                        className={twMerge(
                          "inline-flex items-center gap-1 font-[family-name:var(--font-ai-mono)] text-xs whitespace-nowrap tabular-nums",
                          headline.deltaDirection === "improvement"
                            ? "text-[var(--ai-good-ink)]"
                            : headline.deltaDirection === "regression"
                              ? "text-[var(--ai-bad-ink)]"
                              : "text-[var(--ai-ink-3)]",
                        )}
                      >
                        {headline.deltaDirection === "improvement" ? (
                          <TbTrendingUp aria-hidden="true" className="size-3" />
                        ) : headline.deltaDirection === "regression" ? (
                          <TbTrendingDown aria-hidden="true" className="size-3" />
                        ) : (
                          <TbMinus aria-hidden="true" className="size-3" />
                        )}
                        {headline.delta}
                      </span>
                    ) : null}
                  </span>
                  {headline.caption ? (
                    <Text role="label" as="span" tone="ink-3" truncate className="max-w-full">
                      {headline.caption}
                    </Text>
                  ) : null}
                </span>
              )}
              {selected ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--ai-accent)]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

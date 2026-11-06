// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/dashboard/metrics/BarRow.tsx.
"use client";

import type { CSSProperties, FC, ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { HBar } from "./HBar.js";

interface BarRowBaseProps {
  identity: ReactNode;
  barColor?: string | undefined;
  barHeight?: number | undefined;

  barMuted?: boolean | undefined;

  compact?: boolean | undefined;

  children: ReactNode;
  className?: string | undefined;
}

type BarRowProps = BarRowBaseProps &
  (
    | { barValue: number; barMax: number; bar?: undefined }
    | { bar: ReactNode; barValue?: undefined; barMax?: undefined }
  );

export const ROW_INDEX_CLASS =
  "w-5 shrink-0 font-[family-name:var(--font-ai-mono)] text-xs text-[var(--ai-ink-3)] max-sm:w-[18px] max-sm:text-[11px]";

export const ROW_RULE_CLASS = "border-[rgba(17,25,40,0.06)]";

export const CARD_LINK_CLASS =
  "text-[13px] font-medium text-ai-accent hover:underline max-sm:text-xs";

export const ROW_COUNT_CLASS =
  "w-11 text-right font-[family-name:var(--font-ai-mono)] text-[13px] text-[var(--ai-ink)] max-sm:text-xs";
export const ROW_DELTA_CLASS =
  "w-[60px] text-right font-[family-name:var(--font-ai-mono)] text-xs max-sm:w-11 max-sm:text-[11px]";

export const deltaInkClass = (delta: number | null, invert = false): string =>
  delta === null || delta === 0
    ? "text-[var(--ai-ink-3)]"
    : delta < 0 !== invert
      ? "text-[var(--ai-bad-ink)]"
      : "text-[var(--ai-good-ink)]";

export const CARD_EMPTY_CLASS =
  "py-[22px] text-sm leading-[normal] max-sm:px-2.5 max-sm:py-3.5 max-sm:text-[13px]";

export const BarRow: FC<BarRowProps> = ({
  identity,
  barValue,
  barMax,
  bar,
  barColor,
  barHeight,
  barMuted,
  compact = false,
  children,
  className,
}) => (
  <div className="@container/bar-row w-full min-w-0">
    <div
      className={twMerge(
        "flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px]",
        "@min-[24rem]/bar-row:flex-nowrap @min-[48rem]/bar-row:[--bar-h:10px]",
        compact &&
          "min-h-6 gap-x-2.5 text-sm leading-[normal] max-sm:min-h-0 max-sm:gap-x-2 max-sm:text-[13px]",
        className,
      )}
    >
      <div
        className={twMerge(
          "flex min-w-0 flex-1 items-center gap-2 @min-[24rem]/bar-row:order-1 @min-[24rem]/bar-row:w-[clamp(9rem,40%,16rem)] @min-[24rem]/bar-row:flex-none",
          compact && "gap-2.5 max-sm:gap-2",
        )}
      >
        {identity}
      </div>
      <div
        className={twMerge(
          "order-last basis-full",
          "@min-[24rem]/bar-row:order-2 @min-[24rem]/bar-row:min-w-24 @min-[24rem]/bar-row:flex-1 @min-[24rem]/bar-row:basis-0",
        )}
      >
        {bar ?? (
          <HBar
            value={barValue ?? 0}
            max={barMax ?? 0}
            color={barColor}
            height={barHeight}
            muted={barMuted}
            radius={compact ? 3 : undefined}
          />
        )}
      </div>
      {children}
    </div>
  </div>
);

export const BarRowValue: FC<{
  className?: string | undefined;

  style?: CSSProperties;
  children: ReactNode;
}> = ({ className, style, children }) => (
  <div className={twMerge("shrink-0 @min-[24rem]/bar-row:order-3", className)} style={style}>
    {children}
  </div>
);

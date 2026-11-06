// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/dashboard/metrics/charts/HBar.tsx.
"use client";

import type { FC } from "react";

interface HBarProps {
  value: number;
  max: number;
  color?: string | undefined;

  height?: number | undefined;

  radius?: number | undefined;

  muted?: boolean | undefined;
}

export const HBar: FC<HBarProps> = ({
  value,
  max,
  color = "var(--ai-accent)",
  height,
  radius,
  muted = false,
}) => {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div
      style={{
        background: "var(--ai-surf-2)",
        borderRadius: radius ?? 999,
        height: height ?? "var(--bar-h, 6px)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: color,
          opacity: muted ? 0.4 : undefined,
          width: `${pct * 100}%`,
          height: "100%",
          borderRadius: radius === undefined ? 999 : 0,
          transition: "width 0.45s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.3s ease-out",
        }}
      />
    </div>
  );
};

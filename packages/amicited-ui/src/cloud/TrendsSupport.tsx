import type { ComponentProps, ReactNode } from "react";
import { BrandFavicon as Favicon } from "../brand.js";
import { twMerge } from "tailwind-merge";
export type TrendsTab = "mentions" | "share" | "answers";
export interface TabHeadline {
  value: string;
  caption?: string;
  delta?: string;
  deltaTitle?: string;
  deltaDirection?: "improvement" | "regression" | "neutral";
  loading?: boolean;
}
export interface LegendItem {
  key: string;
  label: string;
  title?: string;
  domain: string;
  color?: string;
  icon?: ReactNode;
  value: string;
  detail?: ReactNode;
  you: boolean;
  onSelect?: () => void;
  active?: boolean;
  muted?: string;
}
// Cloud Text roles used by the trends header; local checks have no period deltas.
export function Text({
  role,
  tone,
  truncate,
  className,
  children,
}: {
  role: "body" | "label";
  as: "span";
  tone: "ink-2" | "ink-3";
  truncate?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={twMerge(
        role === "body" ? "text-body" : "text-xs font-medium",
        tone === "ink-2" ? "text-ai-ink-2" : "text-ai-ink-3",
        truncate && "truncate",
        className,
      )}
    >
      {children}
    </span>
  );
}
export function SkeletonBlock(props: ComponentProps<"div"> & { inset?: boolean }) {
  const { inset: _inset, ...rest } = props;
  return <div {...rest} />;
}
export function YouBadge({ label }: { variant: "chip"; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-full h-4.5 px-2 text-caption bg-ui-accent/14 amicited:bg-ui-accent/14 text-ui-accent amicited:text-ui-accent">
      {label}
    </span>
  );
}
export function BrandFavicon({ domain }: { domain: string; size: number; className: string }) {
  return <Favicon website={domain} name={domain} />;
}

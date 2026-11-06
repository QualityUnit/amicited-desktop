// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/ui/StatusNotification.tsx.
"use client";

import { AmICitedBot } from "../AmICitedBot.js";
import { CRITICAL_TONE, GOOD_TONE, WARNING_TONE } from "./severityStyles.js";
import { StatusLevelLabel } from "./StatusLevelLabel.js";
const pick = <T extends PropertyKey, V>(map: Record<T, V>, key: T, fallback: T): V =>
  map[key] ?? map[fallback];
import { twMerge } from "tailwind-merge";
import type { ComponentProps } from "react";
const Button = ({
  size: _size,
  color: _color,
  applyTheme: _applyTheme,
  theme: _theme,
  ...props
}: ComponentProps<"button"> & {
  size: string;
  color: string;
  applyTheme: unknown;
  theme: unknown;
}) => (
  <button
    {...props}
    className={`inline-flex h-7 items-center justify-center rounded-lg border border-ai-surf-3 bg-ai-surf text-ai-ink hover:bg-ai-bg ${props.className ?? ""}`}
  />
);
import { isValidElement, useId, type FC, type ReactNode } from "react";
import { ChevronDown as TbChevronDown } from "lucide-react";
import { AgentBannerHeader } from "./AgentBannerHeader.js";

export type StatusNotificationTone = "critical" | "warning" | "good";

const TONE = {
  critical: { ...CRITICAL_TONE, mood: "concerned", label: "bad" },
  warning: { ...WARNING_TONE, mood: "watch", label: "warn" },
  good: { ...GOOD_TONE, mood: "happy", label: "good" },
} as const;

const BANNER_LAYOUT = {
  label:
    "min-w-0 flex-1 basis-0 whitespace-normal @3xl/strip:flex-none @3xl/strip:basis-auto @3xl/strip:whitespace-nowrap",
  header: "gap-x-2.5 px-3.5",
  chevron: "order-1 ml-auto @3xl/strip:order-none",
} as const;

export type StatusNotificationQuietTone = "neutral" | "good";

const QUIET_TONE = {
  neutral: { mood: "busy", label: "muted" },
  good: { mood: "happy", label: "good" },
} as const;

interface StatusNotificationProps {
  variant?: "default";
  tone: StatusNotificationTone;

  label: ReactNode;

  ariaLabel: string;
  open: boolean;
  onToggle: () => void;
  expandLabel: string;
  collapseLabel: string;

  headerDivider?: string;
  labelClassName?: string;

  headerClassName?: string;

  header: ReactNode;
  chevronClassName?: string;

  headerActions?: ReactNode;
  children: ReactNode;
}

interface StatusNotificationQuietProps {
  variant: "quiet";
  tone: StatusNotificationQuietTone;

  label: ReactNode;

  ariaLabel: string;

  progress?: ReactNode;

  header?: ReactNode;

  children: ReactNode;
}

const QuietNotification: FC<StatusNotificationQuietProps> = ({
  tone,
  label,
  ariaLabel,
  progress,
  header,
  children,
}) => {
  const spec = pick(QUIET_TONE, tone, "neutral");
  return (
    <section
      data-kit="status-notification"
      aria-label={ariaLabel}
      className="border-ai-line bg-ai-surf @container/strip flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3.5 py-3"
    >
      <AmICitedBot mood={spec.mood} variant="outlined" size={24} />
      <StatusLevelLabel tone={spec.label}>{label}</StatusLevelLabel>
      {progress ? <span className="shrink-0">{progress}</span> : null}
      {}
      <div className="text-ai-ink order-2 min-w-0 basis-full text-sm @3xl/strip:order-none @3xl/strip:basis-auto">
        {children}
      </div>
      {header ? (
        <>
          <span className="hidden flex-1 @3xl/strip:block" />
          {header}
        </>
      ) : null}
    </section>
  );
};

const FoldableNotification: FC<StatusNotificationProps> = ({
  tone: toneName,
  label,
  ariaLabel,
  open,
  onToggle,
  expandLabel,
  collapseLabel,
  headerDivider,
  labelClassName,
  headerClassName,
  header,
  chevronClassName,
  headerActions,
  children,
}) => {
  const bodyId = useId();
  const tone = pick(TONE, toneName, "warning");
  const banner = isValidElement(header) && header.type === AgentBannerHeader;

  return (
    <section
      data-kit="status-notification"
      aria-label={ariaLabel}
      className={twMerge("bg-ai-surf @container/strip overflow-hidden border", tone.frame)}
    >
      <div
        className={twMerge(
          "relative flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5 select-none @3xl/strip:flex-nowrap @3xl/strip:gap-x-2.5 @3xl/strip:px-3.5",
          tone.header,
          banner && BANNER_LAYOUT.header,
          headerClassName,
        )}
      >
        {}
        <button
          type="button"
          onClick={onToggle}
          aria-hidden
          tabIndex={-1}
          className="absolute inset-0 cursor-pointer"
        />
        <AmICitedBot mood={tone.mood} variant="filled" size={28} />
        <StatusLevelLabel
          tone={tone.label}
          className={twMerge(banner && BANNER_LAYOUT.label, labelClassName)}
        >
          {label}
        </StatusLevelLabel>
        {header}
        <Button
          size="xs"
          color="light"
          applyTheme={{ color: { light: "replace" } }}
          theme={{
            color: {
              light:
                "border-ai-surf-3 bg-ai-surf text-ai-ink hover:bg-ai-bg focus:ring-ai-bg border",
            },
          }}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? collapseLabel : expandLabel}
          className={twMerge(
            "relative z-10 aspect-square shrink-0 px-0!",
            banner && BANNER_LAYOUT.chevron,
            headerActions && "ml-auto @3xl/strip:order-last @3xl/strip:ml-0",
            chevronClassName,
          )}
        >
          <TbChevronDown
            aria-hidden
            className={twMerge(
              "size-3.5 transition-transform duration-300 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </Button>
        {headerActions ? (
          <div className="relative z-10 order-2 flex basis-full items-center gap-2 @3xl/strip:order-none @3xl/strip:ml-auto @3xl/strip:basis-auto">
            {headerActions}
          </div>
        ) : null}
      </div>
      {}
      <div
        id={bodyId}
        inert={!open}
        aria-hidden={open ? undefined : true}
        className={twMerge(
          "ease-fold grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={twMerge("border-t", headerDivider ?? tone.divider)}>{children}</div>
        </div>
      </div>
    </section>
  );
};

export const StatusNotification: FC<StatusNotificationProps | StatusNotificationQuietProps> = (
  props,
) =>
  props.variant === "quiet" ? (
    <QuietNotification {...props} />
  ) : (
    <FoldableNotification {...props} />
  );

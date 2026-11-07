// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/dashboard/metrics/ui.tsx.
import { createContext, useContext, type FC, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";
const WebsiteSurfaceContext = createContext(false);
interface SectionHeadBaseProps {
  title: ReactNode;

  titleAs?: "div" | "h2" | "h3";

  stackAction?: boolean;

  dense?: boolean;
}

type SectionHeadProps = SectionHeadBaseProps &
  (
    | {
        variant?: "panel";
        sub?: string;
        action?: ReactNode;

        figure?: ReactNode;
      }
    | { variant: "divider"; sub?: never; action?: never; figure?: never }
  );

const WebsiteSectionHead: FC<SectionHeadProps> = ({
  title,
  titleAs: TitleTag = "div",
  sub,
  action,
  stackAction = false,
}) => (
  <div
    className={twMerge(
      "mb-3.5 flex gap-3",
      stackAction
        ? "flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3"
        : "items-start justify-between",
    )}
  >
    <div className={stackAction ? "sm:min-w-[240px] sm:flex-1" : undefined}>
      <TitleTag className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--ai-ink)]">
        {title}
      </TitleTag>
      {sub ? <div className="mt-0.5 text-xs break-words text-[var(--ai-ink-3)]">{sub}</div> : null}
    </div>
    {action ? (
      <div
        className={twMerge(
          "flex flex-wrap items-center gap-2 whitespace-nowrap",
          stackAction ? "sm:shrink-0" : "shrink-0",
        )}
      >
        {action}
      </div>
    ) : null}
  </div>
);

export const CloudSectionHead: FC<SectionHeadProps> = (props) =>
  useContext(WebsiteSurfaceContext) ? (
    <WebsiteSectionHead {...props} />
  ) : (
    <DashboardSectionHead {...props} />
  );

const DashboardSectionHead: FC<SectionHeadProps> = ({
  title,
  titleAs: TitleTag = "div",
  sub,
  action,
  figure,
  stackAction = false,
  dense = false,
  variant = "panel",
}) =>
  variant === "divider" ? (
    <div className="flex items-center gap-4">
      <TitleTag className="text-lg font-semibold text-[var(--ai-ink)]">{title}</TitleTag>
      <div aria-hidden className="h-px flex-1 bg-[var(--ai-line)]" />
    </div>
  ) : (
    <div
      className={twMerge(
        "mb-2 flex gap-3",
        dense &&
          "mb-2.5 gap-4 leading-[normal] max-sm:mb-2 max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-4 max-sm:gap-y-1",
        stackAction
          ? "flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3"
          : "items-start justify-between",
      )}
    >
      {}
      <div
        className={twMerge(stackAction && "sm:min-w-[240px] sm:flex-1", dense && "max-sm:contents")}
      >
        <TitleTag
          className={twMerge(
            "text-base font-semibold text-[var(--ai-ink)]",
            dense && "leading-[normal] max-sm:col-start-1 max-sm:row-start-1 max-sm:text-sm",
          )}
        >
          {title}
        </TitleTag>
        {sub ? (
          <div
            className={twMerge(
              "mt-0.5 text-[13px] break-words text-[var(--ai-ink-3)]",
              dense &&
                "leading-[normal] max-sm:col-span-2 max-sm:row-start-2 max-sm:mt-0 max-sm:text-xs",
            )}
          >
            {sub}
          </div>
        ) : null}
      </div>
      {action ? (
        <div
          className={twMerge(
            "flex max-w-full flex-wrap items-center gap-2 whitespace-nowrap",
            stackAction ? "sm:shrink-0" : "shrink",
            dense && "max-sm:col-start-2 max-sm:row-start-1",
          )}
        >
          {action}
        </div>
      ) : null}
      {figure ? (
        <div className="max-w-full shrink-0 max-sm:col-span-2 max-sm:row-start-3 max-sm:mt-2">
          {figure}
        </div>
      ) : null}
    </div>
  );

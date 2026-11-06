// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/side-menu/SideNavRow.tsx.
import type { ReactNode, ComponentProps } from "react";
import { twMerge } from "tailwind-merge";
interface SideNavRowClassOptions {
  active?: boolean | undefined;
  subtitle?: boolean;
}
interface SideNavIconClassOptions {
  active?: boolean | undefined;
}
const SIDE_NAV_ROW_BASE_CLASS =
  "group/item relative flex w-full shrink-0 items-center gap-3 rounded-[9px] px-2.5 py-[9px] text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 dark:hover:text-white";

const SIDE_NAV_ROW_COLLAPSED_CLASS =
  "lg:group-data-[collapsed=true]/side:size-[38px] lg:group-data-[collapsed=true]/side:justify-center lg:group-data-[collapsed=true]/side:gap-0 lg:group-data-[collapsed=true]/side:rounded-[10px] lg:group-data-[collapsed=true]/side:p-0";

const SIDE_NAV_ROW_ACTIVE_CLASS =
  "bg-primary-50 text-primary-700 hover:bg-primary-50 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/30 font-semibold";

const SIDE_NAV_ICON_BASE_CLASS =
  "flex w-5 shrink-0 items-center justify-center text-gray-500 group-hover/item:dark:text-white [&_svg]:size-[18px]";

const SIDE_NAV_ICON_ACTIVE_CLASS = "text-primary-700 dark:text-primary-300";

export const getSideNavRowClass = ({ active, subtitle }: SideNavRowClassOptions = {}): string =>
  twMerge(
    SIDE_NAV_ROW_BASE_CLASS,
    subtitle && "items-start",
    active && SIDE_NAV_ROW_ACTIVE_CLASS,
    SIDE_NAV_ROW_COLLAPSED_CLASS,
  );

export const getSideNavIconClass = ({ active }: SideNavIconClassOptions = {}): string =>
  twMerge(SIDE_NAV_ICON_BASE_CLASS, active && SIDE_NAV_ICON_ACTIVE_CLASS);

export function SideNavRow({
  title,
  iconNode,
  active,
  ...props
}: ComponentProps<"a"> & { title: string; iconNode: ReactNode; active?: boolean }) {
  return (
    <a
      {...props}
      aria-label={title}
      aria-current={active ? "page" : undefined}
      className={getSideNavRowClass({ active })}
    >
      <span className={getSideNavIconClass({ active })}>{iconNode}</span>
      <span className="flex min-w-0 flex-1 flex-col lg:group-data-[collapsed=true]/side:hidden">
        <span className="relative flex w-full items-center">
          <span className="min-w-0 truncate">{title}</span>
        </span>
      </span>
    </a>
  );
}

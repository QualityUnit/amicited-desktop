import { MarketingTooltip } from "../primitives.js";
// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/side-menu/SideMenuLogoRow.tsx.

import type { FC, ReactNode } from "react";
import { X as TbX } from "lucide-react";
const SideMenuTooltip = ({ children, label }: { label: string; children: ReactNode }) => (
  <MarketingTooltip label={label} enabled>
    {children}
  </MarketingTooltip>
);

interface SideMenuLogoRowProps {
  logo: ReactNode;
  onToggle: () => void;

  onCloseMobile: () => void;

  collapsible?: boolean;
  collapseLabel: string;
  expandLabel: string;
  closeLabel: string;
}

const svgBase = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PanelCollapseIcon: FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} {...svgBase}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M16 9l-3 3 3 3" />
  </svg>
);

const SideMenuLogoRow: FC<SideMenuLogoRowProps> = ({
  logo,
  onToggle,
  onCloseMobile,
  collapsible = true,
  collapseLabel,
  expandLabel,
  closeLabel,
}) => (
  <>
    {}
    <div className="flex h-13 items-center gap-2 pr-1 lg:group-data-[collapsed=true]/side:hidden">
      <div className="flex min-w-0 items-center [&_.flowHuntLogo]:flex [&_.flowHuntLogo]:w-fit [&_.flowHuntLogo]:items-center [&_.flowHuntLogo]:py-0 [&_a]:inline-flex [&_a]:w-fit [&_img]:block">
        {logo}
      </div>
      {}
      {collapsible && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapseLabel}
          className="ml-auto hidden size-7 shrink-0 items-center justify-center rounded-[7px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:flex dark:hover:bg-gray-700 dark:hover:text-white"
        >
          <PanelCollapseIcon size={16} />
        </button>
      )}
      {}
      <button
        type="button"
        onClick={onCloseMobile}
        aria-label={closeLabel}
        className="ml-auto grid size-8 shrink-0 place-items-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden dark:hover:bg-gray-700 dark:hover:text-white"
      >
        <TbX className="size-[18px]" />
      </button>
    </div>

    {}
    <div className="hidden h-13 items-center justify-start lg:group-data-[collapsed=true]/side:flex">
      <SideMenuTooltip label={expandLabel}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={expandLabel}
          className="[&_strong]:hidden [&_svg]:shrink-0 flex size-[38px] items-center justify-center rounded-[10px] text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-white"
        >
          {logo}
        </button>
      </SideMenuTooltip>
    </div>
  </>
);

export default SideMenuLogoRow;

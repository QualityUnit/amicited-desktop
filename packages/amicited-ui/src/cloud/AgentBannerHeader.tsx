// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/ui/AgentBannerHeader.tsx.
import type { FC, ReactNode } from "react";

interface AgentBannerHeaderProps {
  title: ReactNode;

  more?: ReactNode;

  action?: ReactNode;
}

export const AgentBannerHeader: FC<AgentBannerHeaderProps> = ({ title, more, action }) => (
  <span data-kit="agent-banner-header" className="contents">
    <span className="text-ai-ink order-2 min-w-0 flex-none basis-full text-sm @3xl/strip:order-none @3xl/strip:flex-1 @3xl/strip:truncate">
      {title}
    </span>
    {more ? (
      <span className="text-body text-ai-ink-3 order-4 ml-auto whitespace-nowrap @3xl/strip:order-none @3xl/strip:ml-0">
        {more}
      </span>
    ) : null}
    {action ? (
      <span className="relative z-10 order-3 flex items-center @3xl/strip:order-none">
        {action}
      </span>
    ) : null}
  </span>
);

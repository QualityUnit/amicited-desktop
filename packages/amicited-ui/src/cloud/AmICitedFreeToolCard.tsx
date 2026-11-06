// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/AmICitedFreeToolCard.tsx.
import type { FC, ReactNode } from "react";
import { ArrowRight as TbArrowRight } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { CARD_FRAME } from "./cardFrame.js";
interface AmICitedFreeToolCardProps {
  tool: {
    slug: string;
    icon: ReactNode;
    title: string;
    description: string;
    category: string;
    popular?: boolean;
    i18nKey: string;
  };
  onOpen: (slug: string) => void;

  variant?: "framed" | "compact";
}

export const AmICitedFreeToolCard: FC<AmICitedFreeToolCardProps> = ({
  tool,
  onOpen,
  variant = "framed",
}) => {
  const framed = variant === "framed";

  return (
    <a
      href={"/tools/" + tool.slug}
      onClick={(event) => {
        event.preventDefault();
        onOpen(tool.slug);
      }}
      className={
        framed
          ? "group flex flex-col gap-3.5 bg-[var(--ai-surf)] px-[26px] pt-6 pb-[22px] text-left transition-colors hover:bg-[var(--ai-surf-2)]"
          : twMerge(
              CARD_FRAME,
              "group flex flex-col gap-3 p-[18px] text-left transition-colors hover:border-[var(--ai-line-2)] hover:bg-[var(--ai-surf-2)]",
            )
      }
    >
      <div className="flex items-start gap-3">
        <span className="group-hover:text-ai-on-accent flex size-[38px] shrink-0 items-center justify-center rounded-[4px] bg-[var(--ai-surf-2)] text-[var(--ai-ink-2)] transition-colors group-hover:bg-[var(--ai-ink)]">
          {tool.icon}
        </span>
        <div className="min-w-0">
          <div className="text-[14.5px] leading-tight font-semibold text-[var(--ai-ink)]">
            {tool.title}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {}
            <span className="rounded bg-[var(--ai-surf-2)] px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--ai-ink-3)] uppercase transition-colors group-hover:bg-[var(--ai-surf-3)]">
              {tool.category}
            </span>
            {tool.popular && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                style={{
                  background: "color-mix(in srgb, var(--ai-accent) 10%, transparent)",
                  color: "var(--ai-accent)",
                }}
              >
                Popular
              </span>
            )}
          </div>
        </div>
      </div>

      {framed && (
        <p className="line-clamp-3 text-[12.5px] leading-relaxed text-[var(--ai-ink-3)]">
          {tool.description}
        </p>
      )}

      <div
        className="mt-auto flex items-center justify-between gap-2 border-t border-dashed pt-3"
        style={{ borderColor: "var(--ai-line-2)" }}
      >
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--ai-ink)] group-hover:text-[var(--ai-accent)]">
          Open
          <TbArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
        {framed && <span className="text-[11px] text-[var(--ai-ink-4)]">Local tool</span>}
      </div>
    </a>
  );
};

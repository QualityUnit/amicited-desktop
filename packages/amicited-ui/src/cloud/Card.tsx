// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/amicited/dashboard/metrics/ui.tsx.
import type { ComponentProps } from "react";
import { twMerge } from "tailwind-merge";
import { CARD_FRAME } from "./cardFrame.js";
const CARD_PADDING = "p-5 max-sm:p-4 max-sm:[--tv2-edge:16px]";
const OWN_PADDING = /(?:^|\s)p[xytblr]?-/;
export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section
      {...props}
      className={twMerge(
        CARD_FRAME,
        OWN_PADDING.test(className ?? "") ? "p-5" : CARD_PADDING,
        className,
      )}
    >
      {children}
    </section>
  );
}

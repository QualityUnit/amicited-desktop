import type { ComponentProps } from "react";
export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section {...props} className={`border-t border-border py-4 ${className}`} />;
}

import type { ComponentProps } from "react";
export function Card({ className = "", ...props }: ComponentProps<"section">) {
  return <section {...props} className={`py-4 ${className}`} />;
}

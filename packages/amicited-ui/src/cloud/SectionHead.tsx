import type { ReactNode } from "react";
export function CloudSectionHead({
  title,
  titleAs: Title = "h2",
  sub,
  action,
}: {
  title: ReactNode;
  titleAs?: "div" | "h2" | "h3";
  sub?: string;
  action?: ReactNode;
  dense?: boolean;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <Title className="text-sm font-medium text-foreground">{title}</Title>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

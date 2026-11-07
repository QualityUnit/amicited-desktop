import type { ReactNode } from "react";
export function AmICitedFreeToolCard({
  tool,
  onOpen,
}: {
  tool: {
    slug: string;
    icon: ReactNode;
    title: string;
    description: string;
    category?: string;
    popular?: boolean;
    i18nKey: string;
  };
  onOpen: (slug: string) => void;
  variant?: "framed" | "compact";
}) {
  return (
    <a
      href={"/tools/" + tool.slug}
      onClick={(event) => {
        event.preventDefault();
        onOpen(tool.slug);
      }}
      className="flex items-start gap-3 text-sm text-foreground"
    >
      <span className="pt-0.5 text-muted-foreground">{tool.icon}</span>
      <span>
        <span className="font-medium">{tool.title}</span>
        <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
      </span>
    </a>
  );
}

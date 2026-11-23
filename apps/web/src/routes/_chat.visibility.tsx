import { createFileRoute } from "@tanstack/react-router";

import { AiVisibilityPage } from "../amicited/AiVisibility";

export const Route = createFileRoute("/_chat/visibility")({
  validateSearch: (search: Record<string, unknown>): { site?: string } =>
    typeof search.site === "string" ? { site: search.site } : {},
  component: AiVisibilityPage,
});

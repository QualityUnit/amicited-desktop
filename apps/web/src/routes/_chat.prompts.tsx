import { createFileRoute } from "@tanstack/react-router";
import { useDomains } from "../marketingDomains";
import { PromptDetail } from "../amicited/PromptDetail";
import { PromptsList } from "../amicited/PromptsList";
import { Skeleton } from "../components/ui/skeleton";
export const Route = createFileRoute("/_chat/prompts")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { site?: string | undefined; prompt?: string | undefined; app?: string | undefined } => ({
    ...(typeof search.site === "string" ? { site: search.site } : {}),
    ...(typeof search.prompt === "string" ? { prompt: search.prompt } : {}),
    ...(typeof search.app === "string" ? { app: search.app } : {}),
  }),
  component: PromptsPage,
});
function PromptsPage() {
  const { site, prompt, app } = Route.useSearch();
  const { rows, environmentId, loaded } = useDomains();
  const domain = rows.find((row) => row.projectId === site);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      {!loaded ? (
        <Skeleton shape="card" className="h-64" />
      ) : !domain || !environmentId ? (
        <p>Choose a website in AI Visibility.</p>
      ) : prompt ? (
        <PromptDetail
          key={`${domain.projectId}:${prompt}`}
          domain={domain}
          environmentId={environmentId}
          promptId={prompt}
          app={app}
        />
      ) : (
        <PromptsList
          key={domain.projectId}
          domain={domain}
          domains={rows}
          environmentId={environmentId}
        />
      )}
    </div>
  );
}

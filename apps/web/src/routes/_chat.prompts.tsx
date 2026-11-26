import { createFileRoute } from "@tanstack/react-router";
import { marketingNavigate } from "@amicited/ui-marketing";
import { useDomains } from "../marketingDomains";
import { TrackingPrompts } from "../amicited/amicitedTracking";
import { Button } from "../components/ui/button";
export const Route = createFileRoute("/_chat/prompts")({
  validateSearch: (search: Record<string, unknown>) => ({
    site: typeof search.site === "string" ? search.site : undefined,
  }),
  component: PromptsPage,
});
function PromptsPage() {
  const { site } = Route.useSearch();
  const { rows, environmentId, loaded } = useDomains();
  const domain = rows.find((row) => row.projectId === site);
  if (!loaded) return <p>Loading prompts…</p>;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => marketingNavigate("/visibility")}>
        ← AI Visibility
      </Button>
      {domain && environmentId ? (
        <TrackingPrompts key={domain.projectId} domain={domain} destination={environmentId} />
      ) : (
        <p>Choose a website in AI Visibility.</p>
      )}
    </>
  );
}

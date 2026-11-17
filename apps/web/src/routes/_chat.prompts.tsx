import { createFileRoute } from "@tanstack/react-router";
import { useDomains } from "../marketingDomains";
import { TrackingPrompts } from "../rpc/amicitedTracking";
import { Link } from "@tanstack/react-router";
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
    <main>
      <h1>Prompts and results</h1>
      {rows.map((row) => (
        <p key={row.projectId}>
          <Link to="/prompts" search={{ site: row.projectId }}>
            {row.hostname}
          </Link>
        </p>
      ))}
      {domain && environmentId && (
        <TrackingPrompts key={domain.projectId} domain={domain} destination={environmentId} />
      )}
    </main>
  );
}

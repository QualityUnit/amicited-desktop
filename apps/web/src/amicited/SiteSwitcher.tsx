import type { Domain } from "@amicited/cloud-client/domains";
import { marketingNavigate } from "@amicited/ui-marketing";
import { Toggle, ToggleGroup } from "../components/ui/toggle-group";

/** Switches the page between websites; hidden with only one. */
export function SiteSwitcher({
  domains,
  current,
  path,
}: {
  domains: readonly Domain[];
  current: Domain;
  path: "/visibility" | "/prompts";
}) {
  if (domains.length < 2) return null;
  return (
    <ToggleGroup
      aria-label="Website"
      value={[current.projectId]}
      onValueChange={(values) => {
        if (values[0]) marketingNavigate(`${path}?site=${encodeURIComponent(String(values[0]))}`);
      }}
    >
      {domains.map((d) => (
        <Toggle key={d.projectId} value={d.projectId}>
          {d.hostname}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

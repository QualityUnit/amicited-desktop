import { createFileRoute } from "@tanstack/react-router";
import { ConnectionsHub } from "../amicited/amicitedConnections";
export const Route = createFileRoute("/_chat/marketing-settings")({
  validateSearch: (search: Record<string, unknown>): { connect?: string } =>
    typeof search.connect === "string" ? { connect: search.connect } : {},
  component: () => <ConnectionsHub />,
});

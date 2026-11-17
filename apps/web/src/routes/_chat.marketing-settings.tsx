import { createFileRoute } from "@tanstack/react-router";
import { ConnectionsHub } from "../rpc/amicitedConnections";
export const Route = createFileRoute("/_chat/marketing-settings")({
  component: () => <ConnectionsHub />,
});

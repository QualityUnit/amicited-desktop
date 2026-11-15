import { createFileRoute } from "@tanstack/react-router";
import { MarketingSettings } from "../marketing";
export const Route = createFileRoute("/_chat/marketing-settings")({
  component: () => <MarketingSettings />,
});

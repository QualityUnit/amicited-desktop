import { createFileRoute } from "@tanstack/react-router";
import { MarketingTools } from "../marketing";
export const Route = createFileRoute("/_chat/tools/")({ component: () => <MarketingTools /> });

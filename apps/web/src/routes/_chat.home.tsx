import { createFileRoute } from "@tanstack/react-router";
import { MarketingHome } from "../marketing";
export const Route = createFileRoute("/_chat/home")({ component: () => <MarketingHome /> });

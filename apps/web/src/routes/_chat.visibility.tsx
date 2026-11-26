import { createFileRoute } from "@tanstack/react-router";

import { AiVisibilityPage } from "../amicited/AiVisibility";

export const Route = createFileRoute("/_chat/visibility")({ component: AiVisibilityPage });

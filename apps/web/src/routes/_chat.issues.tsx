import { createFileRoute } from "@tanstack/react-router";

import { IssuesPage } from "../marketingIssues";

export const Route = createFileRoute("/_chat/issues")({ component: IssuesPage });

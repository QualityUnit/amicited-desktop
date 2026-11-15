import { createFileRoute } from "@tanstack/react-router";
import { ReportsList } from "../marketingReports";
export const Route = createFileRoute("/_chat/reports/")({ component: ReportsList });

import { createFileRoute } from "@tanstack/react-router";
import { ReportDetail } from "../marketingReports";
function Detail() {
  const { reportId } = Route.useParams();
  return <ReportDetail key={reportId} reportId={reportId} />;
}
export const Route = createFileRoute("/_chat/reports/$reportId")({ component: Detail });

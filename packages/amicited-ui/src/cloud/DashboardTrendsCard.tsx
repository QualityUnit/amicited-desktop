// Ported from flowhunt2 origin/main 44d4019d4c: dashboard/metrics/DashboardTrendsCard.tsx:81-136.
import type { ReactNode } from "react";
import { Card } from "./Card.js";
export function DashboardTrendsCard({
  tabs,
  legend,
  children,
  tab,
}: {
  tabs: ReactNode;
  legend: ReactNode;
  children: ReactNode;
  tab: string;
}) {
  return (
    <Card className="mb-5 overflow-hidden p-0">
      <div className="grid min-w-0 @5xl/dashboard:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {tabs}
          <div
            id="dashboard-trend-panel"
            role="tabpanel"
            aria-labelledby={`dashboard-trend-tab-${tab}`}
          >
            <div className="flex flex-col p-5 gap-0">{children}</div>
          </div>
        </div>
        {legend}
      </div>
    </Card>
  );
}

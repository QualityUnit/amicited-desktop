import { expect, it, vi } from "vite-plus/test";
import { render } from "../../test/render";
import { FirstCheckReport } from "./FirstCheckReport";
import type { Domain } from "@amicited/cloud-client/domains";
import type { TrackingRun } from "@amicited/cloud-client/tracking";
const domain: Domain = {
  connectionRef: "workspace",
  projectId: "project",
  hostname: "northwind.io",
  brand: "Northwind",
  cms: "unknown",
  siteFiles: null,
  framework: null,
};
const run: TrackingRun = {
  id: "first",
  threadId: "thread",
  projectId: "project",
  day: "2026-11-17",
  status: "running",
  total: 10,
  answers: [],
  answered: 0,
  visibility: null,
};
it("shows and stops a check without any chat messages, including after restoration", async () => {
  const stop = vi.fn();
  await using screen = await render(
    <FirstCheckReport domain={domain} run={run} canRun onStop={stop} onFix={() => {}} />,
  );
  await expect.element(screen.getByText("Checking your prompts", { exact: false })).toBeVisible();
  await screen.getByRole("button", { name: "Stop check" }).click();
  expect(stop).toHaveBeenCalledOnce();
  await screen.rerender(
    <FirstCheckReport
      domain={domain}
      run={JSON.parse(JSON.stringify(run))}
      canRun
      onStop={stop}
      onFix={() => {}}
    />,
  );
  await expect.element(screen.getByRole("button", { name: "Stop check" })).toBeVisible();
});
it("reports unavailable measurements after a failed check", async () => {
  await using screen = await render(
    <FirstCheckReport
      domain={domain}
      run={{ ...run, status: "complete", outcome: "failed" }}
      canRun
      onStop={() => {}}
      onFix={() => {}}
    />,
  );
  await expect
    .element(screen.getByText("Could not complete this check", { exact: false }))
    .toBeVisible();
  await expect.element(screen.getByText("Unavailable", { exact: true })).toBeVisible();
});

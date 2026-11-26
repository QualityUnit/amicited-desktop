import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { render } from "../../test/render";
import { usePersistedThreadRun } from "./threadTracking";
import { FirstCheckReport } from "./FirstCheckReport";
const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => state.read }));
function Report({ milestone }: { milestone: string }) {
  const run = usePersistedThreadRun(
    { environmentId: EnvironmentId.make("fixture"), threadId: ThreadId.make("first-thread") },
    milestone,
  );
  return (
    <FirstCheckReport
      domain={{
        projectId: "project",
        hostname: "northwind.io",
        brand: "Northwind",
        connectionRef: "workspace",
      }}
      run={run ?? undefined}
      canRun
      onFix={() => {}}
      onStop={() => {}}
    />
  );
}
it("restores a message-free first check by durable thread association when later runs replace the snapshot", async () => {
  state.read.mockReset().mockResolvedValue({
    _tag: "Success",
    value: {
      id: "original",
      projectId: "project",
      day: "2026-11-17",
      status: "complete",
      outcome: "failed",
      total: 10,
      answers: [],
    },
  });
  {
    await using screen = await render(<Report milestone="original:complete:0" />);
    await expect.element(screen.getByText(/Could not complete this check/)).toBeVisible();
    expect(state.read.mock.calls[0]?.[0].input).toEqual({ threadId: "first-thread" });
  }
  await using restored = await render(<Report milestone="day-five:complete:60" />);
  await expect.element(restored.getByText(/Could not complete this check/)).toBeVisible();
  expect(state.read).toHaveBeenCalledTimes(2);
});

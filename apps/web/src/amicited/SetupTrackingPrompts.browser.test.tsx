import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { render } from "../../test/render";
import { SetupTrackingPrompts } from "./SetupTrackingPrompts";
const state = vi.hoisted(() => ({ loaded: false, save: vi.fn(), run: vi.fn() }));
vi.mock("./amicitedTracking", () => ({
  BudgetBar: () => null,
  LockPill: () => null,
  useTracking: () => ({
    loaded: state.loaded,
    snapshot: {
      country: "SK",
      configs: state.loaded
        ? [
            {
              projectId: "project",
              country: "SK",
              time: "09:00",
              engines: ["chatgpt"],
              prompts: [
                {
                  id: "saved",
                  text: "Which analytics tools keep data in the EU?",
                  enabled: true,
                  created: "2026-11-17",
                },
              ],
            },
          ]
        : [],
      usage: { used: 1 },
    },
    canSave: true,
    canRun: true,
    save: state.save,
    run: state.run,
    suggest: vi.fn(),
  }),
}));
it("waits for saved prompts before mounting and schedules them without starting a first-check run", async () => {
  state.loaded = false;
  state.save.mockReset().mockResolvedValue({ _tag: "Success", value: { status: "saved" } });
  state.run.mockReset();
  const complete = vi.fn().mockResolvedValue(undefined);
  const props = {
    domain: {
      projectId: "project",
      hostname: "northwind.io",
      brand: "Northwind",
      connectionRef: "workspace",
    },
    destination: EnvironmentId.make("fixture"),
    engines: ["chatgpt"] as const,
    initialPrompts: [],
    onBack: () => {},
    onComplete: complete,
  };
  await using screen = await render(<SetupTrackingPrompts {...props} />);
  await expect.element(screen.getByRole("status")).toBeVisible();
  state.loaded = true;
  await screen.rerender(<SetupTrackingPrompts {...props} />);
  await expect.element(screen.getByRole("checkbox", { name: /Which analytics/ })).toBeChecked();
  await screen.getByRole("button", { name: "Wait until 09:00", exact: true }).click();
  await vi.waitFor(() => expect(complete).toHaveBeenCalledWith(undefined));
  expect(state.run).not.toHaveBeenCalled();
});

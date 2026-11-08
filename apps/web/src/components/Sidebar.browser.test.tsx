import { AsyncResult } from "effect/reactivity";
import { useThreadActions } from "../hooks/useThreadActions";
import "../index.css";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import { makeThreadFixture } from "../test-fixtures";
import { DEFAULT_CLIENT_SETTINGS, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { openCommandPalette } from "../commandPaletteBus";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { __setClientSettingsForTests, getClientSettings } from "../hooks/useSettings";
import { useProjects, useQuietThreadShells, useServerConfigs } from "../state/entities";
import type { Project } from "../types";
import Sidebar from "./Sidebar";
import { Sidebar as SidebarPanel, SidebarProvider } from "./ui/sidebar";

vi.mock("../state/entities", { spy: true });
vi.mock("../hooks/useThreadActions", { spy: true });
vi.mock("../state/session", { spy: true });
vi.mock("../hooks/useHandleNewThread", { spy: true });
vi.mock("../commandPaletteBus", () => ({
  openCommandPalette: vi.fn(),
  isCommandPaletteOpen: () => false,
}));
vi.mock("./sidebar/SidebarChrome", () => ({
  SidebarChromeHeader: () => null,
  SidebarChromeFooter: () => null,
}));

function project(id: string): Project {
  return {
    id: ProjectId.make(id),
    environmentId: EnvironmentId.make("local"),
    title: id,
    workspaceRoot: `/projects/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
  };
}

describe("sidebar header new thread", () => {
  it.each([
    { mode: "normal", count: 2, shift: false, picker: true },
    { mode: "boring", count: 2, shift: false, picker: true },
    { mode: "boring", count: 2, shift: true, picker: false },
    { mode: "boring", count: 1, shift: false, picker: false },
    { mode: "legacy", count: 2, shift: false, picker: false },
  ] as const)("$mode sidebar, $count projects, shift=$shift: picker=$picker", async (scenario) => {
    using stack = new DisposableStack();
    const mode = localStorage.getItem("amicited.workspace-mode");
    localStorage.setItem("amicited.workspace-mode", "developer");
    stack.defer(() =>
      mode === null
        ? localStorage.removeItem("amicited.workspace-mode")
        : localStorage.setItem("amicited.workspace-mode", mode),
    );
    const previousSettings = getClientSettings();
    stack.defer(() => __setClientSettingsForTests(previousSettings));
    __setClientSettingsForTests({
      ...DEFAULT_CLIENT_SETTINGS,
      boringSidebarEnabled: scenario.mode === "boring",
      legacySidebarEnabled: scenario.mode === "legacy",
    });
    const projects = [project("active"), project("idle")].slice(0, scenario.count);
    const currentProjectRef = {
      environmentId: projects[0]!.environmentId,
      projectId: projects[0]!.id,
    };
    const startThread = vi.fn().mockResolvedValue(null);
    vi.mocked(useProjects).mockReturnValue(projects);
    vi.mocked(useHandleNewThread).mockReturnValue({
      activeDraftThread: null,
      activeThread: null,
      defaultProjectRef: currentProjectRef,
      handleNewThread: startThread,
      routeDraftId: null,
      routeThreadRef: null,
    });
    vi.mocked(openCommandPalette).mockClear();
    await using screen = await render(
      <SidebarProvider>
        <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
      </SidebarProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "New thread", exact: true }), {
      modifiers: scenario.shift ? ["Shift"] : [],
    });

    if (scenario.picker) {
      expect(openCommandPalette).toHaveBeenCalledExactlyOnceWith({ open: "new-thread-in" });
      expect(startThread).not.toHaveBeenCalled();
    } else {
      expect(openCommandPalette).not.toHaveBeenCalled();
      expect(startThread).toHaveBeenCalledExactlyOnceWith(currentProjectRef);
    }
  });
});

it.each(["PR", "lifecycle"])(
  "keeps %s controls in the marketer domain sidebar",
  async (scenario) => {
    await page.viewport(1280, 800);
    using stack = new DisposableStack();
    const previousMode = localStorage.getItem("amicited.workspace-mode");
    localStorage.setItem("amicited.workspace-mode", "marketer");
    stack.defer(() =>
      previousMode === null
        ? localStorage.removeItem("amicited.workspace-mode")
        : localStorage.setItem("amicited.workspace-mode", previousMode),
    );
    vi.mocked(readEnvironmentScope).mockReturnValue(true);
    vi.mocked(useEnvironmentScope).mockReturnValue(true);
    const domain = project("example.com");
    vi.mocked(useProjects).mockReturnValue([domain]);
    const thread = makeThreadFixture({
      environmentId: domain.environmentId,
      projectId: domain.id,
      title: "Website update",
      settledOverride: "active",
      pullRequests: [
        {
          host: "github.com",
          repository: "example/site",
          number: 45,
          url: "https://github.com/example/site/pull/45",
          source: "manual",
          linkedAt: "2026-11-08T00:00:00Z",
          stack: null,
          snapshot: {
            state: "merged",
            title: "Update website",
            headBranch: "website",
            baseBranch: "main",
            isDraft: false,
            updatedAt: null,
            syncedAt: "2026-11-08T00:00:00Z",
          },
        },
      ],
    });
    vi.mocked(useQuietThreadShells).mockReturnValue([thread]);
    vi.mocked(useServerConfigs).mockReturnValue(
      new Map([
        [domain.environmentId, { environment: { capabilities: { threadPullRequests: true } } }],
      ]) as never,
    );
    const actualActions = await vi.importActual<typeof import("../hooks/useThreadActions")>(
      "../hooks/useThreadActions",
    );
    let refresh = async () => {};
    let current = thread;
    const change = async (patch: Partial<typeof thread>) => {
      current = { ...current, ...patch };
      vi.mocked(useQuietThreadShells).mockReturnValue([current]);
      await refresh();
      return AsyncResult.success({ sequence: 1 });
    };
    vi.mocked(useThreadActions).mockImplementation(() => ({
      ...actualActions.useThreadActions(),
      settleThread: (() => change({ settledOverride: "settled" })) as ReturnType<
        typeof useThreadActions
      >["settleThread"],
      unsettleThread: (() => change({ settledOverride: "active" })) as ReturnType<
        typeof useThreadActions
      >["unsettleThread"],
      snoozeThread: ((_ref, until) => change({ snoozedUntil: until })) as ReturnType<
        typeof useThreadActions
      >["snoozeThread"],
      unsnoozeThread: (() => change({ snoozedUntil: null })) as ReturnType<
        typeof useThreadActions
      >["unsnoozeThread"],
    }));
    const ui = () => (
      <SidebarProvider style={{ height: 800 }}>
        <SidebarPanel>
          <Sidebar routeReveal={{ observedKey: null, pendingKey: null }} />
        </SidebarPanel>
      </SidebarProvider>
    );
    await using screen = await render(ui());
    refresh = () => screen.rerender(ui());
    if (scenario === "PR") {
      await expect
        .element(screen.getByRole("link", { name: "PR #45 - Merged: Update website" }))
        .toBeVisible();
      await userEvent.click(
        screen.getByRole("button", { name: "Chat actions for Website update" }),
      );
      await expect
        .element(page.getByRole("menuitem", { name: "Open pull request", exact: true }))
        .toBeVisible();
      await expect
        .element(page.getByRole("menuitem", { name: "Settle thread", exact: true }))
        .toBeVisible();
      await expect
        .element(page.getByRole("menuitem", { name: "Snooze", exact: true }))
        .toBeVisible();
      await userEvent.keyboard("{Escape}");
      vi.mocked(useQuietThreadShells).mockReturnValue([{ ...thread, pullRequests: [] }]);
      await screen.rerender(ui());
      await expect
        .element(screen.getByRole("link", { name: "PR #45 - Merged: Update website" }))
        .not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", { name: "Chat actions for Website update" }),
      );
      await expect
        .element(page.getByRole("menuitem", { name: "Open pull request", exact: true }))
        .not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      return;
    }
    await userEvent.click(screen.getByRole("button", { name: "Chat actions for Website update" }));
    await userEvent.click(page.getByRole("menuitem", { name: "Settle thread", exact: true }));
    await expect
      .element(screen.getByRole("button", { name: "Settled 1", exact: true }))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Settled 1", exact: true }));
    await userEvent.click(screen.getByRole("button", { name: "Chat actions for Website update" }));
    await userEvent.click(page.getByRole("menuitem", { name: "Un-settle thread", exact: true }));
    await expect
      .element(screen.getByRole("button", { name: "Settled 0", exact: true }))
      .toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Chat actions for Website update" }));
    await page.getByRole("menuitem", { name: "Snooze", exact: true }).hover();
    await userEvent.click(page.getByRole("menuitem", { name: /In 1 hour/ }));
    await expect.element(screen.getByRole("button", { name: /Snoozed 1/ })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Chat actions for Website update" }))
      .not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Snoozed 1/ }));
    await userEvent.click(screen.getByRole("button", { name: "Chat actions for Website update" }));
    await userEvent.click(page.getByRole("menuitem", { name: "Wake thread", exact: true }));
    await expect
      .element(screen.getByRole("button", { name: "Chat actions for Website update" }))
      .toBeVisible();
    vi.mocked(useQuietThreadShells).mockReturnValue([
      { ...thread, settledOverride: "active", snoozedUntil: "2000-01-01T00:00:00Z" },
    ]);
    await screen.rerender(ui());
    await expect
      .element(screen.getByRole("button", { name: "Chat actions for Website update" }))
      .toBeVisible();
  },
);

import { AsyncResult } from "effect/reactivity";
import { useThreadActions } from "../hooks/useThreadActions";
import "../index.css";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import { makeThreadFixture } from "../test-fixtures";
import {
  DEFAULT_CLIENT_SETTINGS,
  EnvironmentId,
  ProjectId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";
import { openCommandPalette } from "../commandPaletteBus";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { __setClientSettingsForTests, getClientSettings } from "../hooks/useSettings";
import { useProjects, useQuietThreadShells, useServerConfigs } from "../state/entities";
import type { Project } from "../types";
import { useCloudApprovals } from "../rpc/amicitedApprovals";
import { resolveThreadRouteTarget } from "../threadRoutes";
import Sidebar from "./Sidebar";
import { Sidebar as SidebarPanel, SidebarProvider } from "./ui/sidebar";

vi.mock("../rpc/amicitedApprovals", { spy: true });
vi.mock("../threadRoutes", { spy: true });
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

it.each([
  "PR",
  "lifecycle",
  "tool-failure",
  "auth-failure",
  "working",
  "working-attention",
  "active-tool-failure",
  "active-auth-failure",
  "active-approval",
])("keeps %s controls in the marketer domain sidebar", async (scenario) => {
  await page.viewport(1280, 800);
  using stack = new DisposableStack();
  const previousSettings = getClientSettings();
  stack.defer(() => __setClientSettingsForTests(previousSettings));
  __setClientSettingsForTests({ ...DEFAULT_CLIENT_SETTINGS, sidebarWorkingShelfEnabled: true });
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
    id: ThreadId.make(`marketer-${scenario}`),
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
  vi.mocked(resolveThreadRouteTarget).mockReturnValue(
    scenario.startsWith("active-")
      ? { kind: "server", threadRef: { environmentId: thread.environmentId, threadId: thread.id } }
      : null,
  );
  stack.defer(() => vi.mocked(resolveThreadRouteTarget).mockRestore());
  vi.mocked(useCloudApprovals).mockReturnValue(
    scenario === "active-approval" ? ([{ threadId: thread.id }] as never) : [],
  );
  stack.defer(() => vi.mocked(useCloudApprovals).mockRestore());
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
  const openMenu = async () => {
    await screen.getByTestId("sidebar-row-folder").hover();
    await userEvent.click(screen.getByRole("button", { name: "Chat actions for Website update" }));
  };
  if (scenario === "active-approval") {
    await expect.element(screen.getByText("Needs your OK", { exact: true })).toBeVisible();
    return;
  }
  if (scenario.endsWith("tool-failure") || scenario.endsWith("auth-failure")) {
    await change({
      latestRun: {
        runId: RunId.make("completed-check"),
        status: "completed",
        requestedAt: null,
        startedAt: null,
        completedAt: thread.updatedAt,
        assistantMessageId: null,
      },
      source: {
        ...thread.source,
        latestMarketingCheckFailed: true,
        lastError: scenario.endsWith("auth-failure")
          ? "Authentication required. Please sign in."
          : null,
      },
      runtime: scenario.endsWith("auth-failure")
        ? {
            status: "failed",
            activeRunId: null,
            providerInstanceId: thread.providerInstanceId,
            providerName: "Claude",
            lastError: "Authentication required. Please sign in.",
            updatedAt: thread.updatedAt,
          }
        : null,
    });
    await expect
      .element(
        screen.getByText(scenario.endsWith("auth-failure") ? "Sign in needed" : "Couldn't check", {
          exact: true,
        }),
      )
      .toBeVisible();
    return;
  }
  if (scenario === "working" || scenario === "working-attention") {
    await change({
      runtime: {
        status: "running",
        activeRunId: null,
        providerInstanceId: thread.providerInstanceId,
        providerName: "Claude",
        lastError: null,
        updatedAt: thread.updatedAt,
      },
    });
    await expect
      .element(screen.getByRole("button", { name: "Working 1", exact: true }))
      .toBeVisible();
    const working = screen.getByRole("button", { name: "Working 1", exact: true });
    if (working.element().getAttribute("aria-expanded") === "false") await userEvent.click(working);
    await expect
      .element(screen.getByRole("button", { name: "Chat actions for Website update" }))
      .toBeVisible();
    await expect.element(screen.getByText("Working", { exact: true }).last()).toBeVisible();
    await change({
      runtime:
        scenario === "working-attention"
          ? {
              status: "failed",
              activeRunId: null,
              providerInstanceId: thread.providerInstanceId,
              providerName: "Claude",
              lastError: "Check failed",
              updatedAt: thread.updatedAt,
            }
          : null,
    });
    await expect
      .element(screen.getByRole("button", { name: "Working 1", exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole("button", { name: "Chat actions for Website update" }))
      .toBeVisible();
    await expect.element(screen.getByTestId("sidebar-row-folder")).toBeVisible();
    return;
  }
  if (scenario === "PR") {
    await expect
      .element(screen.getByRole("link", { name: "PR #45 - Merged: Update website" }))
      .toBeVisible();
    await openMenu();
    await expect
      .element(page.getByRole("menuitem", { name: "Open pull request", exact: true }))
      .toBeVisible();
    await expect
      .element(page.getByRole("menuitem", { name: "Settle chat", exact: true }))
      .toBeVisible();
    await expect.element(page.getByRole("menuitem", { name: "Snooze", exact: true })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    vi.mocked(useQuietThreadShells).mockReturnValue([{ ...thread, pullRequests: [] }]);
    await screen.rerender(ui());
    await expect
      .element(screen.getByRole("link", { name: "PR #45 - Merged: Update website" }))
      .not.toBeInTheDocument();
    await openMenu();
    await expect
      .element(page.getByRole("menuitem", { name: "Open pull request", exact: true }))
      .not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    return;
  }
  await openMenu();
  await userEvent.click(page.getByRole("menuitem", { name: "Settle chat", exact: true }));
  await expect
    .element(screen.getByRole("button", { name: "Settled 1", exact: true }))
    .toBeVisible();
  const settled = screen.getByRole("button", { name: "Settled 1", exact: true });
  if (settled.element().getAttribute("aria-expanded") === "false") await userEvent.click(settled);
  await openMenu();
  await userEvent.click(page.getByRole("menuitem", { name: "Un-settle chat", exact: true }));
  await expect
    .element(screen.getByRole("button", { name: "Settled 0", exact: true }))
    .toBeVisible();
  await openMenu();
  await page.getByRole("menuitem", { name: "Snooze", exact: true }).hover();
  await userEvent.click(page.getByRole("menuitem", { name: /In 1 hour/ }));
  await expect.element(screen.getByRole("button", { name: /Snoozed 1/ })).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Chat actions for Website update" }))
    .not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Snoozed 1/ }));
  await openMenu();
  await userEvent.click(page.getByRole("menuitem", { name: "Wake chat", exact: true }));
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
});

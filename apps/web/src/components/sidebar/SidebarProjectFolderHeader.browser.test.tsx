import "../../index.css";
import { EnvironmentId, ProjectId, IsoDateTime } from "@t3tools/contracts";
import { CodeIcon, FolderIcon } from "lucide-react";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { SidebarProjectFolderHeader } from "./SidebarProjectFolderHeader";

it.each([
  { dark: false, displayName: "flowhunt.io" },
  { dark: true, displayName: "flowhunt.io" },
  { dark: false, displayName: "a-very-long-hostname-that-must-truncate.example.com" },
  { dark: true, displayName: "a-very-long-hostname-that-must-truncate.example.com" },
])(
  "keeps domain icons apart from actions at rest, hover and focus ($dark, $displayName)",
  async ({ dark, displayName }) => {
    const group: SidebarProjectSnapshot = {
      id: ProjectId.make("domain"),
      environmentId: EnvironmentId.make("local"),
      title: displayName,
      displayName,
      workspaceRoot: "/site",
      defaultModelSelection: null,
      projectIcon: { kind: "emoji", emoji: "🌐" },
      scripts: [],
      createdAt: IsoDateTime.make("2026-11-08T00:00:00.000Z"),
      updatedAt: IsoDateTime.make("2026-11-08T00:00:00.000Z"),
      projectKey: "domain",
      groupedProjectCount: 1,
      environmentPresence: "local-only",
      allRemoteMembersAreDesktopLocal: false,
      allRemoteMembersAreWsl: false,
      memberProjects: [],
      memberProjectRefs: [],
      remoteEnvironmentLabels: [],
      pinned: false,
      archived: false,
    };
    await using screen = await render(
      <div className={dark ? "dark" : ""} style={{ width: 256 }}>
        <ul>
          <SidebarProjectFolderHeader
            group={group}
            collapsed={false}
            hiddenThreads={[]}
            onToggle={vi.fn()}
            onNewThread={vi.fn()}
            onContextMenu={vi.fn()}
            newThreadLabel="New chat"
            status={
              <span className="flex shrink-0 items-center gap-1">
                <span data-status-icon className="size-1.5 rounded-full" />
                <CodeIcon data-status-icon className="size-3" />
                <FolderIcon data-status-icon className="size-3" />
              </span>
            }
          />
        </ul>
      </div>,
    );
    const action = screen.getByRole("button", { name: `New chat in ${displayName}` });
    const row = screen.getByTestId("sidebar-project-folder");
    const verify = () => {
      const icons = [...screen.container.querySelectorAll("[data-status-icon]")];
      const boxes = [...icons, action.element()].map((node) => node.getBoundingClientRect());
      const boundary = row.element().getBoundingClientRect();
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i]!;
        expect(box.width).toBeGreaterThan(0);
        expect(box.left).toBeGreaterThanOrEqual(boundary.left);
        expect(box.right).toBeLessThanOrEqual(boundary.right);
        for (const other of boxes.slice(i + 1))
          expect(box.right <= other.left || other.right <= box.left).toBe(true);
      }
    };
    verify();
    await row.hover();
    verify();
    await userEvent.unhover(row);
    action.element().focus();
    await expect.element(action).toHaveFocus();
    verify();
  },
);

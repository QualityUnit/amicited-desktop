import "../../index.css";
import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./sidebar";

function CollapseFromInside() {
  const { setOpen } = useSidebar();
  return (
    <button type="button" onClick={() => setOpen(false)}>
      Collapse
    </button>
  );
}

function Harness(props: { readonly onResize?: (width: number) => void }) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar
        collapsible="offcanvas"
        resizable={{
          minWidth: 200,
          maxWidth: 600,
          ...(props.onResize ? { onResize: props.onResize } : {}),
        }}
      >
        <CollapseFromInside />
        <SidebarRail />
      </Sidebar>
      <SidebarTrigger />
    </SidebarProvider>
  );
}

describe("Sidebar", () => {
  it("hands focus to the outside trigger when it collapses around the focused control", async () => {
    await page.viewport(1280, 800);
    await using screen = await render(<Harness />, { router: false /* no routes involved */ });

    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));

    const sidebar = screen.container.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
    await vi.waitFor(() => expect(sidebar.inert).toBe(true));
    const trigger = screen.container.querySelector('[data-slot="sidebar-trigger"]');
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("abandons a rail drag when the sidebar collapses mid-drag", async () => {
    await page.viewport(1280, 800);
    const onResize = vi.fn();
    await using screen = await render(<Harness onResize={onResize} />, {
      router: false /* no routes involved */,
    });
    const rail = screen.container.querySelector<HTMLElement>('[data-sidebar="rail"]')!;
    const { left, top } = rail.getBoundingClientRect();
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientY: top + 10 };
    const dragTo = (clientX: number) => {
      rail.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: left }));
      rail.dispatchEvent(new PointerEvent("pointermove", { ...pointer, clientX }));
    };
    // A completed drag commits, so the abandoned one below is a real drag too.
    dragTo(left + 40);
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 40 }));
    expect(onResize).toHaveBeenCalledTimes(1);

    dragTo(left + 80);
    await userEvent.click(
      screen.container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')!,
    );
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 80 }));

    expect(onResize).toHaveBeenCalledTimes(1);
  });
});

it("clamps a resized sidebar and persists the committed width", async () => {
  await page.viewport(1280, 800);
  const key = "sidebar-resize-test";
  using _storage = {
    [Symbol.dispose]() {
      localStorage.removeItem(key);
    },
  };
  const onResize = vi.fn();
  await using screen = await render(
    <SidebarProvider>
      <Sidebar resizable={{ minWidth: 208, maxWidth: 640, storageKey: key, onResize }}>
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>,
    { router: false /* resize has no routes */ },
  );
  const rail = screen.container.querySelector<HTMLElement>('[data-sidebar="rail"]')!;
  const drag = (distance: number) => {
    const { left, top } = rail.getBoundingClientRect();
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientY: top + 10 };
    rail.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: left }));
    rail.dispatchEvent(new PointerEvent("pointermove", { ...pointer, clientX: left + distance }));
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + distance }));
  };
  drag(80);
  expect(onResize).toHaveBeenLastCalledWith(336);
  expect(localStorage.getItem(key)).toBe("336");
  drag(2000);
  expect(onResize).toHaveBeenLastCalledWith(640);
  expect(localStorage.getItem(key)).toBe("640");
  drag(-2000);
  expect(onResize).toHaveBeenLastCalledWith(208);
  expect(localStorage.getItem(key)).toBe("208");
});

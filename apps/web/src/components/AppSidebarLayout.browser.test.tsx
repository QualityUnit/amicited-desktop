import "../index.css";
import { expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../test/render";
import { AppSidebarLayout } from "./AppSidebarLayout";
import { THREAD_SIDEBAR_WIDTH_STORAGE_KEY } from "./threadSidebarWidth";

it("restores the marketer sidebar width on remount", async () => {
  await page.viewport(1344, 1016);
  const previous = localStorage.getItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
  using _storage = {
    [Symbol.dispose]() {
      if (previous === null) localStorage.removeItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
      else localStorage.setItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY, previous);
    },
  };
  localStorage.setItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY, "400");
  const ui = (key: number) => (
    <AppSidebarLayout key={key} marketer sidebarContent={<p>Domains</p>}>
      <main>Chat</main>
    </AppSidebarLayout>
  );
  await using screen = await render(ui(0));
  const width = () =>
    screen.container.querySelector('[data-slot="sidebar-container"]')!.getBoundingClientRect()
      .width;
  expect(width()).toBe(400);
  const rail = screen.container.querySelector<HTMLElement>('[data-sidebar="rail"]')!;
  const box = rail.getBoundingClientRect();
  const pointer = {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    button: 0,
    clientY: box.top + 40,
  };
  rail.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: box.left }));
  rail.dispatchEvent(new PointerEvent("pointermove", { ...pointer, clientX: box.left - 80 }));
  rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: box.left - 80 }));
  expect(localStorage.getItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY)).toBe("320");
  await screen.rerender(ui(1));
  expect(width()).toBe(320);
});

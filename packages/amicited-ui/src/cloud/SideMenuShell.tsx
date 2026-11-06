// Ported from flowhunt2 origin/main 44d4019d4c: frontend/src/components/side-menu/SideMenuShell.tsx.
import type { ReactNode } from "react";
export function SideMenuShell({
  collapsed,
  header,
  footer,
  children,
}: {
  collapsed: boolean;
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <aside
      className="group/side relative z-40 flex h-full shrink-0"
      data-collapsed={String(collapsed)}
    >
      <div className="flex h-full w-full flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Main navigation"
            className="relative flex w-[300px] max-w-[85vw] shrink-0 flex-col transition-[width] duration-200 motion-reduce:transition-none lg:w-[var(--fh-side-w,17rem)] lg:max-w-full lg:group-data-[collapsed=true]/side:w-15"
          >
            <div className="shrink-0 bg-white px-2 lg:group-data-[collapsed=true]/side:px-[11px] dark:bg-gray-800">
              {header}
            </div>
            <div
              data-side-menu-scroll-body
              className="flex flex-1 flex-col gap-px overflow-x-hidden overflow-y-auto px-2.5 pt-1 pb-3 lg:group-data-[collapsed=true]/side:px-[11px]"
            >
              {children}
            </div>
            <div className="hidden shrink-0 lg:block">{footer}</div>
          </nav>
        </div>
      </div>
    </aside>
  );
}

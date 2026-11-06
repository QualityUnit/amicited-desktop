import { MarketingSearch } from "./search.js";
import { SideMenuShell } from "./cloud/SideMenuShell.js";
import { PageBreadcrumbs } from "./cloud/PageBreadcrumbs.js";
import { SideNavRow } from "./cloud/SideNavRow.js";
import SideMenuLogoRow from "./cloud/SideMenuLogoRow.js";
import { packs, activeToolPack } from "./packs.js";
import { useState, type ReactNode } from "react";
import {
  MarketingButton,
  MarketingIcon,
  MarketingToolbarContext,
  MarketingScopeContext,
  MarketingTitleContext,
  MarketingTooltip,
} from "./primitives.js";
import { AmICitedMark, BrandFavicon, readBrand } from "./brand.js";
const destinations = [
  ["Home", "/home"],
  ["Tasks", "/tasks"],
  ["Tools", "/tools"],
  ["Settings", "/settings/general"],
  ["AmICited", "/marketing-settings"],
] as const;
export function MarketingShell({
  children,
  path,
  hash = "",
  navigate,
  taskView = false,
  mode = "marketer",
  connectionStatus,
}: {
  children: ReactNode;
  path: string;
  hash?: string;
  navigate: (path: string) => void;
  taskView?: boolean;
  mode?: "marketer" | "developer";
  connectionStatus?: ReactNode;
}) {
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [scope, setScope] = useState<HTMLDivElement | null>(null);
  const [title, setTitle] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("amicited.rail-collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [toolsOpen, setToolsOpen] = useState(() => {
    try {
      return localStorage.getItem("amicited.tools-open") !== "false";
    } catch {
      return true;
    }
  });
  const activePack = activeToolPack(path, hash);
  const brand = readBrand();
  if (mode === "developer") return children;
  return (
    <MarketingToolbarContext value={toolbar}>
      <MarketingScopeContext value={scope}>
        <MarketingTitleContext value={title}>
          <div
            data-amicited-shell=""
            data-amicited-tokens=""
            className={collapsed ? "am-shell am-shell-collapsed" : "am-shell"}
          >
            <SideMenuShell
              collapsed={collapsed}
              header={
                <>
                  {" "}
                  <SideMenuLogoRow
                    logo={<AmICitedMark />}
                    collapseLabel="Collapse sidebar"
                    expandLabel="Expand sidebar"
                    closeLabel="Close sidebar"
                    onCloseMobile={() => {}}
                    onToggle={() => {
                      const next = !collapsed;
                      setCollapsed(next);
                      localStorage.setItem("amicited.rail-collapsed", String(next));
                    }}
                  />
                  <MarketingSearch navigate={navigate} />
                  <MarketingTooltip label="Edit website" enabled={collapsed}>
                    <a
                      className="workspaceDropDown group/item text-ai-ink hover:bg-ai-bg max-lg:border-ai-surf-3 max-lg:bg-ai-surf-hover lg:border-ai-surf-2 flex w-full cursor-pointer items-center gap-2 rounded-[10px] p-1.5 text-left transition-colors focus:outline-hidden max-lg:mb-6 max-lg:border lg:mb-4 lg:border am-domain"
                      aria-label={`Edit website ${brand?.website ?? "settings"}`}
                      href="/settings/general#website"
                      onClick={(event) => {
                        event.preventDefault();
                        navigate("/settings/general#website");
                      }}
                    >
                      <BrandFavicon name={brand?.name ?? "Website"} website={brand?.website} />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-[13px] leading-tight font-semibold">
                          {brand?.website.replace(/^https?:\/\//, "") ?? "Choose a website"}
                        </strong>
                        <small className="text-ai-ink-3 hidden truncate text-[11px] font-normal lg:block">
                          Active domain
                        </small>
                      </span>
                      <MarketingIcon name="edit" />
                    </a>
                  </MarketingTooltip>
                </>
              }
              footer={
                <div className="am-rail-footer">
                  <div>
                    <strong>Free</strong> <span>local tools</span>
                  </div>
                  {connectionStatus ?? (
                    <p>
                      AmICited · Not connected{" "}
                      <a
                        href="/marketing-settings"
                        onClick={(event) => {
                          event.preventDefault();
                          navigate("/marketing-settings");
                        }}
                      >
                        Connect →
                      </a>
                    </p>
                  )}
                </div>
              }
            >
              {destinations.map(([label, href]) => (
                <SideNavRow
                  tooltip={collapsed}
                  title={label}
                  iconNode={<MarketingIcon name={label} />}
                  active={path === href && !(href === "/tools" && activePack)}
                  key={href}
                  href={href}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(href);
                  }}
                  className="am-nav-row"
                  data-tooltip={collapsed ? label : undefined}
                  aria-label={label}
                  aria-current={
                    path === href && !(href === "/tools" && activePack) ? "page" : undefined
                  }
                ></SideNavRow>
              ))}
              <button
                type="button"
                className="px-2.5 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 lg:group-data-[collapsed=true]/side:hidden flex w-full items-center justify-between overflow-hidden rounded-md hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-200 am-nav-group"
                aria-hidden={collapsed}
                tabIndex={collapsed ? -1 : undefined}
                aria-expanded={toolsOpen}
                aria-controls="am-tools-group"
                onClick={() => {
                  const next = !toolsOpen;
                  setToolsOpen(next);
                  try {
                    localStorage.setItem("amicited.tools-open", String(next));
                  } catch {
                    /* Disclosure works without storage. */
                  }
                }}
              >
                <span>Tool packs</span>
                <MarketingIcon name={toolsOpen ? "down" : "right"} />
              </button>
              <div id="am-tools-group" hidden={!collapsed && !toolsOpen}>
                {packs.map(([pack, label]) => (
                  <SideNavRow
                    tooltip={collapsed}
                    title={label}
                    iconNode={<MarketingIcon name={pack} />}
                    active={activePack === pack}
                    key={pack}
                    className="am-nav-row"
                    href={"/tools#" + pack}
                    data-tooltip={collapsed ? label : undefined}
                    aria-label={label}
                    aria-current={activePack === pack ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate("/tools#" + pack);
                    }}
                  ></SideNavRow>
                ))}
              </div>
            </SideMenuShell>
            <div className="am-workspace">
              <header className="am-topbar">
                <div
                  onClick={(event) => {
                    const link = (event.target as HTMLElement).closest("a");
                    if (link) {
                      event.preventDefault();
                      navigate(link.getAttribute("href")!);
                    }
                  }}
                >
                  <PageBreadcrumbs
                    currentAsHeading={path !== "/new"}
                    items={[
                      {
                        label: (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <BrandFavicon
                              name={brand?.name ?? "Website"}
                              website={brand?.website}
                            />
                            <span className="max-w-[24ch] truncate">
                              {brand?.website.replace(/^https?:\/\//, "") ?? "Your workspace"}
                            </span>
                          </span>
                        ),
                        href: "/home",
                        truncate: true,
                      },
                      ...(path.startsWith("/tools/") ? [{ label: "Tools", href: "/tools" }] : []),
                      {
                        label: (
                          <span ref={setTitle}>
                            {" "}
                            <span className="am-default-title">
                              {taskView
                                ? "Task"
                                : path.startsWith("/tools/")
                                  ? path
                                      .split("/")
                                      .at(-1)
                                      ?.split(".")
                                      .slice(1)
                                      .join(" ")
                                      .replace(/\b\w/g, (c) => c.toUpperCase())
                                  : (destinations.find(([, href]) => path === href)?.[0] ??
                                    (path === "/new"
                                      ? "New task"
                                      : path === "/usage"
                                        ? "AI plan usage"
                                        : "Settings"))}
                            </span>
                          </span>
                        ),
                      },
                    ]}
                  />
                </div>
                <div className="am-topbar-actions">
                  <div ref={setToolbar} />
                  {path !== "/new" && (
                    <MarketingButton
                      variant="agent"
                      data-ask-agent=""
                      onClick={() => navigate("/new")}
                    >
                      <MarketingIcon name="sparkles" />
                      New task
                      <kbd>⌘J</kbd>
                    </MarketingButton>
                  )}
                </div>
              </header>
              <div className="am-filter-band" ref={setScope} />
              <main
                data-amicited-font=""
                className={taskView ? "am-main am-task text-body" : "am-main text-body"}
                onClick={(event) => {
                  if (event.defaultPrevented) return;
                  const link = (event.target as HTMLElement).closest("a");
                  if (
                    link?.getAttribute("href")?.startsWith("/") &&
                    !event.metaKey &&
                    !event.ctrlKey
                  ) {
                    event.preventDefault();
                    navigate(link.getAttribute("href")!);
                  }
                }}
              >
                {children}
              </main>
            </div>
          </div>
        </MarketingTitleContext>
      </MarketingScopeContext>
    </MarketingToolbarContext>
  );
}

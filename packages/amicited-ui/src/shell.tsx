import { useState, type ReactNode } from "react";
import {
  MarketingButton,
  MarketingIcon,
  MarketingToolbarContext,
  MarketingScopeContext,
  MarketingTitleContext,
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
  navigate,
  taskView = false,
  mode = "marketer",
  connectionStatus,
}: {
  children: ReactNode;
  path: string;
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
  const brand = readBrand();
  if (mode === "developer") return children;
  return (
    <MarketingToolbarContext value={toolbar}>
      <MarketingScopeContext value={scope}>
        <MarketingTitleContext value={title}>
          <div
            data-amicited-shell=""
            className={collapsed ? "am-shell am-shell-collapsed" : "am-shell"}
          >
            <aside className="am-rail">
              <div className="am-logo-row">
                <AmICitedMark />
                <button
                  type="button"
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-expanded={!collapsed}
                  onClick={() => {
                    const next = !collapsed;
                    setCollapsed(next);
                    try {
                      localStorage.setItem("amicited.rail-collapsed", String(next));
                    } catch {
                      /* Keep the rail usable without storage. */
                    }
                  }}
                >
                  <MarketingIcon name={collapsed ? "expand" : "collapse"} />
                </button>
              </div>
              <a
                className="am-domain"
                href="/settings/general#website"
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/settings/general#website");
                }}
              >
                <BrandFavicon name={brand?.name ?? "Website"} website={brand?.website} />
                <span>
                  <strong>
                    {brand?.website.replace(/^https?:\/\//, "") ?? "Choose a website"}
                  </strong>
                  <small>Your website</small>
                </span>
                <MarketingIcon name="chevron" />
              </a>
              <nav aria-label="Main navigation">
                {destinations.map(([label, href]) => (
                  <a
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
                      path === href || (href === "/tools" && path.startsWith("/tools/"))
                        ? "page"
                        : undefined
                    }
                  >
                    <MarketingIcon name={label} />
                    <span>{label}</span>
                  </a>
                ))}
                <div className="am-nav-group">
                  <span>Tools</span>
                  <MarketingIcon name="chevron" />
                </div>
                {(
                  [
                    ["seo", "Site audit"],
                    ["ai-visibility", "AI visibility"],
                    ["content", "Content"],
                    ["serp", "SERP & keywords"],
                  ] as const
                ).map(([pack, label]) => (
                  <a
                    key={pack}
                    className="am-nav-row"
                    href={"/tools#" + pack}
                    data-tooltip={collapsed ? label : undefined}
                    aria-label={label}
                    aria-current={path === "/tools#" + pack ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      navigate("/tools#" + pack);
                    }}
                  >
                    <MarketingIcon name={pack} />
                    <span>{label}</span>
                  </a>
                ))}
              </nav>
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
            </aside>
            <div className="am-workspace">
              <header className="am-topbar">
                <nav aria-label="Breadcrumb">
                  <a
                    href="/home"
                    onClick={(event) => {
                      event.preventDefault();
                      navigate("/home");
                    }}
                  >
                    <BrandFavicon name={brand?.name ?? "Website"} website={brand?.website} />
                    {brand?.website.replace(/^https?:\/\//, "") ?? "Your workspace"}
                  </a>
                  <span>/</span>
                  {path.startsWith("/tools/") && (
                    <>
                      <a
                        href="/tools"
                        onClick={(event) => {
                          event.preventDefault();
                          navigate("/tools");
                        }}
                      >
                        Tools
                      </a>
                      <span>/</span>
                    </>
                  )}
                  <strong ref={setTitle}>
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
                  </strong>
                </nav>
                <div className="am-topbar-actions">
                  <div ref={setToolbar} />
                  <MarketingButton
                    variant="outline"
                    data-ask-agent=""
                    onClick={() => navigate("/new")}
                  >
                    <MarketingIcon name="sparkles" />
                    New task
                  </MarketingButton>
                </div>
              </header>
              <div className="am-filter-band" ref={setScope} />
              <main
                className={taskView ? "am-main am-task" : "am-main"}
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

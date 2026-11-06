import { useState, type ReactNode } from "react";
import { MarketingButton, MarketingIcon, MarketingToolbarContext } from "./primitives.js";
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
  headerActions,
}: {
  children: ReactNode;
  path: string;
  navigate: (path: string) => void;
  taskView?: boolean;
  mode?: "marketer" | "developer";
  connectionStatus?: ReactNode;
  headerActions?: ReactNode;
}) {
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  if (mode === "developer") return children;
  return (
    <MarketingToolbarContext value={toolbar}>
      <div data-amicited-shell="" className="am-shell">
        <aside className="am-rail">
          <div className="am-logo-row">
            <AmICitedMark />
          </div>
          <a
            className="am-domain"
            href="/settings/general#website"
            onClick={(event) => {
              event.preventDefault();
              navigate("/settings/general#website");
            }}
          >
            <BrandFavicon name={readBrand()?.name ?? "Website"} website={readBrand()?.website} />
            <span>
              <strong>
                {readBrand()?.website.replace(/^https?:\/\//, "") ?? "Choose a website"}
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
                aria-current={
                  path === href || (href === "/tools" && path.startsWith("/tools/"))
                    ? "page"
                    : undefined
                }
              >
                <MarketingIcon name={label} />
                {label}
              </a>
            ))}
          </nav>
          <div className="am-rail-footer">
            <strong>Free · local tools</strong>
            <small>No account required</small>
            {connectionStatus ?? (
              <a
                href="/marketing-settings"
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/marketing-settings");
                }}
              >
                Connect AmICited →
              </a>
            )}
          </div>
        </aside>
        <div className="am-workspace">
          <header className="am-topbar">
            <nav aria-label="Breadcrumb">
              <span>{readBrand()?.name ?? "Your workspace"}</span>
              <span>/</span>
              {path.startsWith("/tools/") && (
                <>
                  <span>Tools</span>
                  <span>/</span>
                </>
              )}
              <strong>
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
              </strong>
            </nav>
            <div className="am-topbar-actions">
              <div ref={setToolbar} />
              {headerActions}
              <MarketingButton variant="outline" onClick={() => navigate("/new")}>
                <MarketingIcon name="plus" />
                New task
              </MarketingButton>
            </div>
          </header>
          <main
            className={taskView ? "am-main am-task" : "am-main"}
            onClick={(event) => {
              if (event.defaultPrevented) return;
              const link = (event.target as HTMLElement).closest("a");
              if (link?.getAttribute("href")?.startsWith("/") && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                navigate(link.getAttribute("href")!);
              }
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </MarketingToolbarContext>
  );
}

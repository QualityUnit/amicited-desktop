import { resultTitle } from "./experience.js";
import { PanelLeftClose, PanelLeftOpen, Wrench, PlugZap, Settings, History } from "lucide-react";
import { useState, useContext, type ReactNode, type ComponentProps } from "react";
import { AmICitedMark } from "./brand.js";
import { MarketingUiContext, MarketingTooltip, MarketingButton } from "./primitives.js";
export function MarketingShell({
  children,
  path,
  navigate,
  mode = "marketer",
  history,
  brandHeader,
  footer,
  headerTitle,
}: {
  children: ReactNode;
  path: string;
  navigate: (path: string) => void;
  mode?: "marketer" | "developer";
  hash?: string;
  taskView?: boolean;
  connectionStatus?: ReactNode;
  history?: ReactNode;
  brandHeader?: ReactNode;
  footer?: ReactNode;
  headerTitle?: string | undefined;
}) {
  const { Breadcrumb } = useContext(MarketingUiContext);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("amicited.rail-collapsed") === "true",
  );
  if (mode === "developer") return children;
  return (
    <div
      data-amicited-shell=""
      data-amicited-tokens=""
      className={`am-chat-shell ${collapsed ? "am-chat-collapsed" : ""}`}
    >
      <aside data-app-sidebar="" className="am-chat-sidebar" aria-label="Chat sidebar">
        <div className="am-chat-brand">
          {brandHeader ?? <AmICitedMark />}
          <div className="am-sidebar-toggle">
            <MarketingButton
              size="icon-sm"
              variant="header"
              className="relative top-auto translate-y-0"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => {
                setCollapsed(!collapsed);
                localStorage.setItem("amicited.rail-collapsed", String(!collapsed));
              }}
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </MarketingButton>
          </div>
        </div>
        <nav aria-label="Chat history" className="am-chat-history">
          {collapsed ? (
            <MarketingTooltip label="Chat history">
              <MarketingButton aria-label="Chat history" onClick={() => setCollapsed(false)}>
                <History size={16} />
              </MarketingButton>
            </MarketingTooltip>
          ) : (
            history
          )}
        </nav>
        {footer ?? (
          <nav aria-label="Workspace">
            {(
              [
                ["Tools", "/tools", Wrench],
                ["AmICited", "/marketing-settings", PlugZap],
                ["Settings", "/settings/general", Settings],
              ] as const
            ).map(([label, href, Icon]) => (
              <MarketingTooltip key={label} label={label}>
                <a
                  key={String(href)}
                  aria-label={String(label)}
                  href={String(href)}
                  aria-current={path.startsWith(String(href)) ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(String(href));
                  }}
                >
                  {typeof Icon !== "string" && Icon && <Icon size={16} />}
                </a>
              </MarketingTooltip>
            ))}
          </nav>
        )}
      </aside>
      <main className="am-chat-main">
        {headerTitle ||
        ["/tools", "/settings", "/marketing-settings", "/usage"].some((prefix) =>
          path.startsWith(prefix),
        ) ? (
          <>
            <MarketingHeader className="am-page-header">
              {Breadcrumb ? (
                <Breadcrumb>
                  {headerTitle ??
                    (path.startsWith("/tools")
                      ? path === "/tools"
                        ? "Tools"
                        : path.endsWith("/result")
                          ? "Result"
                          : resultTitle({ tool: decodeURIComponent(path.split("/").at(-1) ?? "") })
                      : path === "/marketing-settings"
                        ? "AmICited"
                        : "Settings")}
                </Breadcrumb>
              ) : (
                <span>
                  {path.startsWith("/tools")
                    ? "Tools" +
                      (path === "/tools"
                        ? ""
                        : " / " +
                          (path.endsWith("/result")
                            ? "Result"
                            : resultTitle({
                                tool: decodeURIComponent(path.split("/").at(-1) ?? ""),
                              })))
                    : "Your workspace / " +
                      (path === "/marketing-settings" ? "AmICited" : "Settings")}
                </span>
              )}
            </MarketingHeader>
            <div className="am-secondary-page">{children}</div>
          </>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

export function MarketingHeader({ className = "", ...props }: ComponentProps<"div">) {
  return <div {...props} className={`am-header-content ${className}`} />;
}

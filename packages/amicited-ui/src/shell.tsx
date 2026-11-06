import {
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
  Wrench,
  Sparkles,
  Settings,
  ArrowLeft,
  History,
} from "lucide-react";
import { useState, type ReactNode, type ComponentProps } from "react";
import { AmICitedMark } from "./brand.js";
import { MarketingTooltip, MarketingButton } from "./primitives.js";
export function MarketingShell({
  children,
  path,
  navigate,
  mode = "marketer",
  history,
}: {
  children: ReactNode;
  path: string;
  navigate: (path: string) => void;
  mode?: "marketer" | "developer";
  hash?: string;
  taskView?: boolean;
  connectionStatus?: ReactNode;
  history?: ReactNode;
}) {
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
      <aside className="am-chat-sidebar" aria-label="Chat sidebar">
        <div className="am-chat-brand">
          <AmICitedMark />
          <MarketingButton
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => {
              setCollapsed(!collapsed);
              localStorage.setItem("amicited.rail-collapsed", String(!collapsed));
            }}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </MarketingButton>
        </div>
        <MarketingButton variant="default" aria-label="New chat" onClick={() => navigate("/new")}>
          <SquarePen size={16} />
          {!collapsed && "New chat"}
        </MarketingButton>
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
        <nav aria-label="Workspace">
          {(
            [
              ["Tools", "/tools", Wrench],
              ["AmICited", "/marketing-settings", Sparkles],
              ["Settings", "/settings/general", Settings],
            ] as const
          ).map(([label, href, Icon]) => (
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
              {!collapsed && String(label)}
            </a>
          ))}
        </nav>
      </aside>
      <main className="am-chat-main">
        {["/tools", "/settings", "/marketing-settings", "/usage"].some((prefix) =>
          path.startsWith(prefix),
        ) ? (
          <>
            <MarketingHeader className="am-page-header">
              Your workspace /{" "}
              {path.startsWith("/tools")
                ? path !== "/tools" &&
                  sessionStorage.getItem(
                    "amicited.result-origin." +
                      (() => {
                        try {
                          return (
                            JSON.parse(sessionStorage.getItem("amicited.last-result") ?? "null")
                              ?.id ?? ""
                          );
                        } catch {
                          return "";
                        }
                      })(),
                  )
                  ? "Chat"
                  : "Tools"
                : path === "/marketing-settings"
                  ? "AmICited"
                  : "Settings"}
            </MarketingHeader>
            <div className="am-secondary-page">
              <MarketingButton
                onClick={() => navigate(sessionStorage.getItem("amicited.return-chat") ?? "/home")}
              >
                <ArrowLeft size={14} />
                Back to chat
              </MarketingButton>
              {path === "/tools" || path.startsWith("/settings") ? (
                <h1>
                  {path === "/tools"
                    ? "Tools"
                    : path === "/marketing-settings"
                      ? "AmICited"
                      : path.startsWith("/settings")
                        ? "Settings"
                        : "Tool result"}
                </h1>
              ) : null}
              {children}
            </div>
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

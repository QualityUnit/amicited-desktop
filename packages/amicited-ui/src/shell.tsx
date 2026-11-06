import { useState, type ReactNode } from "react";
import { AmICitedMark } from "./brand.js";
import { MarketingButton } from "./primitives.js";
export function MarketingShell({
  children,
  path,
  navigate,
  mode = "marketer",
  chats = [],
}: {
  children: ReactNode;
  path: string;
  navigate: (path: string) => void;
  mode?: "marketer" | "developer";
  hash?: string;
  taskView?: boolean;
  connectionStatus?: ReactNode;
  chats?: readonly { title: string; href: string }[];
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
            {collapsed ? "→" : "←"}
          </MarketingButton>
        </div>
        <MarketingButton variant="default" aria-label="New chat" onClick={() => navigate("/new")}>
          {collapsed ? "+" : "+ New chat"}
        </MarketingButton>
        <nav aria-label="Chat history" className="am-chat-history">
          {!collapsed && <small>Recent chats</small>}
          {chats.map((chat) => (
            <a
              key={chat.href}
              aria-label={chat.title}
              aria-current={path === chat.href ? "page" : undefined}
              href={chat.href}
              onClick={(e) => {
                e.preventDefault();
                navigate(chat.href);
              }}
            >
              {collapsed ? "·" : chat.title}
            </a>
          ))}
        </nav>
        <nav aria-label="Workspace">
          {[
            ["Tools", "/tools"],
            ["AmICited", "/marketing-settings"],
            ["Settings", "/settings/general"],
          ].map(([label, href]) => (
            <a
              key={href}
              aria-label={label}
              href={href}
              onClick={(e) => {
                e.preventDefault();
                navigate(href!);
              }}
            >
              {collapsed ? label!.slice(0, 1) : label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="am-chat-main">{children}</main>
    </div>
  );
}

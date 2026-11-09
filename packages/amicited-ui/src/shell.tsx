import { resultTitle } from "./experience.js";
import { useContext, type ReactNode, type ComponentProps } from "react";
import { MarketingUiContext } from "./primitives.js";
export function MarketingShell({
  children,
  path,
  mode = "marketer",
  headerTitle,
  desktop,
}: {
  children: ReactNode;
  path: string;
  navigate: (path: string) => void;
  mode?: "marketer" | "developer";
  hash?: string;
  taskView?: boolean;
  connectionStatus?: ReactNode;
  externalSidebar?: boolean;
  history?: ReactNode;
  brandHeader?: ReactNode;
  footer?: ReactNode;
  headerTitle?: string | undefined;
  desktop?: boolean;
  sidebar?: { collapsed: boolean; toggle: () => void; expand: () => void; control: ReactNode };
}) {
  const { Breadcrumb } = useContext(MarketingUiContext);
  if (mode === "developer") return children;
  return (
    <div data-amicited-shell="" data-amicited-tokens="" className="am-chat-shell">
      <main className="am-chat-main">
        {headerTitle ||
        ["/tools", "/settings", "/marketing-settings", "/usage"].some((prefix) =>
          path.startsWith(prefix),
        ) ? (
          <>
            <MarketingHeader className={`am-page-header ${desktop ? "drag-region" : ""}`}>
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

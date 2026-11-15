import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
export function MarketingNavigationBridge({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Router bridge for the standalone marketing UI package.
  useEffect(() => {
    const listener = (event: Event) => {
      void navigate({ to: (event as CustomEvent<string>).detail });
    };
    window.addEventListener("amicited-navigate", listener);
    return () => window.removeEventListener("amicited-navigate", listener);
  }, [navigate]);
  return children;
}

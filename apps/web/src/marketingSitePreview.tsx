import type { ScopedThreadRef } from "@t3tools/contracts";
import { useKnownTerminalSessions } from "./state/terminalSessions";
import { useThreadTerminalActions } from "./components/terminal/useThreadTerminalActions";
import { useRightPanelStore } from "./rightPanelStore";
import { Button } from "./components/ui/button";

export function MarketingSitePreview({ threadRef }: { threadRef: ScopedThreadRef | null }) {
  const sessions = useKnownTerminalSessions({
    environmentId: threadRef?.environmentId ?? null,
    threadId: threadRef?.threadId ?? null,
  });
  const actions = useThreadTerminalActions(threadRef);
  const site = sessions?.find((s) => s.target.terminalId === "amicited-site");
  if (!site || !threadRef) return null;
  const active = site.state.summary?.status === "running";
  return (
    <div className="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground">
      <span>
        {site.state.summary?.hasRunningSubprocess
          ? "Site process is running"
          : active
            ? "Site process is idle"
            : "Site process stopped"}
      </span>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => useRightPanelStore.getState().openTerminal(threadRef, "amicited-site")}
      >
        View logs
      </Button>
      {active && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => actions.closeTerminalSession("amicited-site")}
        >
          Stop site
        </Button>
      )}
    </div>
  );
}

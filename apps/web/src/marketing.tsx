import { useAtomValue } from "@effect/atom-react";
import {
  Home,
  ToolsGrid,
  ToolForm,
  MarketingSettings,
  MarketingShell,
  useWorkspaceMode,
  setWorkspaceMode,
} from "@amicited/ui-marketing";
import type { ToolCard, ToolResult } from "@amicited/tools-core";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { connectionAtomRuntime } from "./connection/runtime";
import { useAtomCommand } from "./state/use-atom-command";
import { usePrimaryEnvironmentId } from "./state/environments";
import { useScratchProject } from "./hooks/useScratchProject";
import { useNewThreadHandler } from "./hooks/useHandleNewThread";

const listCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tools.list",
  label: "marketing:list",
});
const runCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tools.run",
  label: "marketing:run",
});
export function MarketingBoundary({ children }: { children: ReactNode }) {
  const mode = useWorkspaceMode();
  const path = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  return mode === "marketer" ? (
    <MarketingShell path={path} navigate={(path) => void navigate({ to: path })}>
      {children}
    </MarketingShell>
  ) : (
    <>
      <button
        onClick={() => {
          setWorkspaceMode("marketer");
          void navigate({ to: "/home" });
        }}
      >
        Switch to marketer mode
      </button>
      {children}
    </>
  );
}
export function MarketingHome() {
  const environmentId = usePrimaryEnvironmentId();
  const scratch = useScratchProject();
  const newThread = useNewThreadHandler();
  return (
    <Home
      startTask={async (prompt) => {
        if (!environmentId) throw new Error("No machine");
        const project = await scratch.openScratchProject(environmentId);
        if (!project) throw new Error("No workspace");
        await newThread(scopeProjectRef(project.environmentId, project.id), { prompt });
      }}
    />
  );
}
export function MarketingTools({ name }: { name?: string }) {
  const environmentId = usePrimaryEnvironmentId();
  const list = useAtomCommand(listCommand);
  const run = useAtomCommand(runCommand);
  const loadTools = useEffectEvent(list);
  const canRun = useAtomValue(runCommand.permissionAtom(environmentId));
  const [tools, setTools] = useState<readonly ToolCard[]>([]);
  const [error, setError] = useState("");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- loads the registry from the connected environment
  useEffect(() => {
    if (!environmentId) return;
    let active = true;
    void loadTools({ environmentId, input: undefined }).then((result) => {
      if (!active) return;
      if (result._tag === "Success") setTools(result.value as unknown as ToolCard[]);
      else setError("Could not load tools. Reconnect your machine and try again.");
    });
    return () => {
      active = false;
    };
  }, [environmentId]);
  if (error) return <p role="alert">{error}</p>;
  if (!tools.length) return <p>Loading local tools…</p>;
  if (!name) return <ToolsGrid tools={tools} />;
  const tool = tools.find((tool) => tool.name === name);
  if (!tool) return <p>Tool not found.</p>;
  return (
    <ToolForm
      key={name}
      tool={tool}
      disabled={!canRun}
      run={async (input) => {
        if (!environmentId) throw new Error("No machine");
        const result = await run({ environmentId, input: { name, input } });
        if (result._tag !== "Success") throw new Error("Tool failed");
        return result.value as unknown as ToolResult;
      }}
    />
  );
}
export { MarketingSettings };

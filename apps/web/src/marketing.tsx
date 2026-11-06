/* oxlint-disable shadcn/no-unknown-classes -- Marketing classes are supplied by @amicited/ui-marketing, independent of the upstream Tailwind theme. */
import { newProjectId } from "./lib/utils";
import { projectEnvironment } from "./state/projects";
import { useProjects } from "./state/entities";
import { ConnectedAgentsStep } from "./components/onboarding/WelcomeWizard";
import { getOnboardingProviderState } from "./onboarding/providerReadiness.logic";
import type { Brand } from "@amicited/ui-marketing";
import { useAtomValue } from "@effect/atom-react";
import {
  FirstRun,
  readBrand,
  MarketingResult,
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
import { useEnvironmentProviders, usePrimaryEnvironmentId } from "./state/environments";
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
  // AmICited extension: one role boundary owns navigation and settings visibility.
  const mode = useWorkspaceMode();
  const path = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  return mode === "marketer" ? (
    <MarketingShell path={path} navigate={(path) => void navigate({ to: path })}>
      {path === "/settings/general" || path === "/marketing-settings" ? (
        <MarketingSettings />
      ) : path.startsWith("/settings") ? (
        <MarketingSettings />
      ) : path === "/usage" ? (
        <div className="am-page">
          <h1>Your AI plan usage</h1>
          <p>
            These limits come from your AI subscriptions. Local website checks do not use your AI
            allowance.
          </p>
          <section className="am-card">
            <MarketingSubscriptions usageLink={false} />
          </section>
        </div>
      ) : ["/pull-requests", "/source-control"].includes(path) ? (
        <Home
          startTask={async () => {
            await navigate({ to: "/new" });
          }}
        />
      ) : (
        children
      )}
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
  const actions = useMarketingTask();
  const [recent] = useState<ToolResult | null>(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("amicited.last-result") ?? "null",
      ) as ToolResult | null;
    } catch {
      return null;
    }
  });
  return (
    <Home
      startTask={actions.startTask}
      subscriptions={<MarketingSubscriptions />}
      recent={recent ? <MarketingResult result={recent} fix={actions.startTask} /> : undefined}
    />
  );
}

export function MarketingTools({ name }: { name?: string }) {
  const actions = useMarketingTask();
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
  if (!tool)
    return (
      <>
        <h1>This tool is not available yet</h1>
        <p>Explore the tools available on this device.</p>
        <ToolsGrid tools={tools} />
      </>
    );
  return (
    <ToolForm
      fix={actions.startTask}
      onResult={rememberResult}
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

export function MarketingFirstRun() {
  const environmentId = usePrimaryEnvironmentId();
  const actions = useMarketingTask();
  const list = useAtomCommand(listCommand);
  const run = useAtomCommand(runCommand);
  const navigate = useNavigate();
  return (
    <FirstRun
      fix={actions.startTask}
      subscriptions={<MarketingSubscriptions />}
      prepare={actions.prepare}
      skip={() => {
        localStorage.setItem("amicited.onboarded", "true");
        void navigate({ to: "/home" });
      }}
      check={async (brand) => {
        if (!environmentId) throw new Error("Not connected");
        const registry = await list({ environmentId, input: undefined });
        if (registry._tag !== "Success") throw new Error("Could not load tools");
        const tools = registry.value as unknown as ToolCard[];
        const name = tools.some((t) => t.name === "seo.site.audit")
          ? "seo.site.audit"
          : "seo.ssl.check";
        const response = await run({
          environmentId,
          input: {
            name,
            input:
              name === "seo.ssl.check"
                ? { domain: new URL(brand.website).hostname }
                : { url: brand.website },
          },
        });
        if (response._tag !== "Success") throw new Error("Could not run check");
        const result = response.value as unknown as ToolResult;
        rememberResult(result);
        return result;
      }}
    />
  );
}
function rememberResult(result: ToolResult) {
  sessionStorage.setItem("amicited.last-result", JSON.stringify(result));
}
function useMarketingTask() {
  const environmentId = usePrimaryEnvironmentId();
  const scratch = useScratchProject();
  const newThread = useNewThreadHandler();
  const create = useAtomCommand(projectEnvironment.create);
  const projects = useProjects();
  const prepare = async (brand: Brand) => {
    if (!environmentId) throw new Error("Still connecting. Please try again.");
    const existing = projects.find(
      (p) => p.environmentId === environmentId && p.title === brand.name,
    );
    if (existing) return scopeProjectRef(existing.environmentId, existing.id);
    const base = await scratch.openScratchProject(
      environmentId,
      "Could not get your website ready",
    );
    if (!base) throw new Error("Could not get ready. Please try again.");
    const projectId = newProjectId();
    const result = await create({
      environmentId,
      input: {
        projectId,
        title: brand.name,
        workspaceRoot: base.workspaceRoot + "/" + new URL(brand.website).hostname,
        createWorkspaceRootIfMissing: true,
      },
    });
    if (result._tag !== "Success")
      throw new Error("Could not get your website ready. Please try again.");
    return scopeProjectRef(environmentId, projectId);
  };
  return {
    prepare: async (brand: Brand) => {
      await prepare(brand);
    },
    startTask: async (prompt: string) => {
      const brand = readBrand();
      if (brand) {
        await newThread(await prepare(brand), { prompt });
        return;
      }
      if (!environmentId) throw new Error("Not connected");
      const project = await scratch.openScratchProject(environmentId);
      if (!project) throw new Error("Could not start task");
      await newThread(scopeProjectRef(project.environmentId, project.id), { prompt });
    },
  };
}
function MarketingSubscriptions({ usageLink = true }: { usageLink?: boolean }) {
  const environmentId = usePrimaryEnvironmentId();
  const all = useEnvironmentProviders();
  const providers = environmentId ? all.get(environmentId) : undefined;
  const [connect, setConnect] = useState<string | null>(null);
  return (
    <>
      <div>
        {[
          ["claudeAgent", "Claude"],
          ["codex", "ChatGPT"],
          ["gemini", "Gemini"],
        ].map(([driver, label]) => {
          const provider = providers?.find((p) => p.driver === driver);
          const ready = getOnboardingProviderState(provider) === "ready";
          const weekly = provider?.usageLimits?.windows.find((w) => w.kind === "weekly");
          return (
            <div className="am-provider" key={driver}>
              <span>
                <b>{label}</b>
                <br />
                <small>
                  {ready
                    ? weekly
                      ? `${Math.round(100 - weekly.usedPercent)}% left this week`
                      : "Ready to help · plan usage not reported"
                    : provider
                      ? "Not connected"
                      : "Not available yet"}
                </small>
              </span>
              {!ready && (
                <button onClick={() => setConnect(connect === label ? null : (label ?? null))}>
                  Connect {label}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {connect && (
        <section className="am-card">
          <h2>Connect {connect}</h2>
          {connect === "Gemini" && !providers?.some((p) => p.driver === "gemini") && (
            <p>
              Gemini is not available in this installation yet. You can connect Claude or ChatGPT
              below, or keep using the free website checks.
            </p>
          )}
          <p>
            Choose your subscription below and follow its sign-in instructions. Your login stays on
            this device.
          </p>
          <details>
            <summary>Advanced setup and sign-in</summary>
            {environmentId && (
              <ConnectedAgentsStep
                environmentId={environmentId}
                machineLabel="Your AI subscriptions"
              />
            )}
          </details>
        </section>
      )}
      {usageLink && <a href="/usage">View AI plan usage →</a>}
    </>
  );
}
export function MarketingNewTask() {
  const actions = useMarketingTask();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="am-page">
      <p className="am-eyebrow">YOUR AI ASSISTANT</p>
      <h1>New task</h1>
      <p>Start with a goal, a question, or a rough idea.</p>
      <form
        className="am-card"
        onSubmit={(e) => {
          e.preventDefault();
          void actions
            .startTask(prompt)
            .catch(() => setError("Could not start a task. Please try again."));
        }}
      >
        <label>
          What do you want to get done?
          <textarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What do you want to get done?"
            required
          />
        </label>
        <button>Start a task</button>
        {error && <p role="alert">{error}</p>}
      </form>
      <MarketingSubscriptions />
    </div>
  );
}

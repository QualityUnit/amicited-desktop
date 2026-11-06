import { useThreadRouteTarget } from "./hooks/useThreadRouteTarget";
import { isUsefulResult } from "@amicited/tools-core";
import { usePrimarySettings } from "./hooks/useSettings";
import { serverEnvironment } from "./state/server";
import { resolveAppModelSelectionState } from "./modelSelection";
import { Switch } from "./components/ui/switch";
import { Link } from "@tanstack/react-router";
/* oxlint-disable shadcn/no-unknown-classes -- Marketing classes are supplied by @amicited/ui-marketing, independent of the upstream Tailwind theme. */
import {
  CloudFooter,
  CloudHome,
  CloudTools,
  CloudPage,
  CloudStatusLine,
} from "./rpc/amicitedCloud";
import { ResultFooterContext } from "@amicited/ui-marketing";
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
  Home,
  ToolsGrid,
  ToolForm,
  MarketingSettings as MarketingSettingsView,
  MarketingShell,
  useWorkspaceMode,
  resultTitle,
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

const renderCloudFooter = (result: ToolResult) => <CloudFooter result={result} />;

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
  const taskTarget = useThreadRouteTarget();
  const path = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Router bridge for the standalone marketing UI package.
  useEffect(() => {
    const listener = (event: Event) => {
      void navigate({ to: (event as CustomEvent<string>).detail });
    };
    window.addEventListener("amicited-navigate", listener);
    return () => window.removeEventListener("amicited-navigate", listener);
  }, [navigate]);
  return mode === "marketer" ? (
    <ResultFooterContext value={renderCloudFooter}>
      <MarketingShell
        taskView={taskTarget !== null}
        path={path}
        navigate={(path) => void navigate({ to: path })}
      >
        {path === "/marketing-settings" ? (
          <CloudPage />
        ) : path === "/settings/general" ? (
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
    </ResultFooterContext>
  ) : (
    children
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
      cloud={<CloudHome />}
      recent={
        recent && isUsefulResult(recent) ? (
          <Link to="/tools/$toolName" params={{ toolName: recent.tool }} className="am-card">
            {resultTitle(recent)} ·{" "}
            {typeof recent.output === "object" && recent.output && "score" in recent.output
              ? `${recent.output.score}/100`
              : "View results"}{" "}
            →
          </Link>
        ) : undefined
      }
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
  if (!name)
    return (
      <>
        <ToolsGrid tools={tools} />
        <CloudTools />
      </>
    );
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
const renderModeSwitch = (checked: boolean, onChange: (checked: boolean) => void) => (
  <Switch aria-label="Developer features" checked={checked} onCheckedChange={onChange} />
);
export function MarketingSettings() {
  return <MarketingSettingsView connection={<CloudStatusLine />} modeControl={renderModeSwitch} />;
}

export function MarketingFirstRun() {
  const environmentId = usePrimaryEnvironmentId();
  const actions = useMarketingTask();
  const run = useAtomCommand(runCommand);
  const navigate = useNavigate();
  return (
    <ResultFooterContext value={renderCloudFooter}>
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
          const response = await run({
            environmentId,
            input: { name: "seo.site.audit", input: { url: brand.website } },
          });
          if (response._tag !== "Success") throw new Error("Could not run check");
          const result = response.value as unknown as ToolResult;
          rememberResult(result);
          return result;
        }}
      />
    </ResultFooterContext>
  );
}
function rememberResult(result: ToolResult) {
  if (!isUsefulResult(result)) return;
  sessionStorage.setItem("amicited.last-result", JSON.stringify(result));
  localStorage.setItem("amicited.first-win", "true");
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
  const settings = usePrimarySettings();
  const update = useAtomCommand(serverEnvironment.updateSettings);
  const mutateProvider = useAtomCommand(serverEnvironment.mutateProviderInstance);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders);
  const [selectionError, setSelectionError] = useState("");
  const choose = async (driver: string) => {
    const candidates = providers?.filter((p) => p.driver === driver) ?? [];
    const selection = resolveAppModelSelectionState(settings, candidates);
    if (!environmentId || !candidates.length) return;
    const result = await update({
      environmentId,
      input: { patch: { textGenerationModelSelection: selection } },
    });
    if (result._tag !== "Success") throw new Error("Could not save assistant");
  };
  return (
    <>
      <div>
        {[
          ["claudeAgent", "Claude"],
          ["codex", "ChatGPT"],
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
              {ready ? (
                <button
                  className="am-text-button"
                  onClick={() =>
                    void choose(driver!).catch(() =>
                      setSelectionError("Could not save your assistant. Please try again."),
                    )
                  }
                >
                  {settings.textGenerationModelSelection?.instanceId === provider?.instanceId
                    ? `${label} selected`
                    : `Use ${label}`}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setConnect(connect === label ? null : (label ?? null));
                    if (provider && !provider.enabled && environmentId) {
                      const instance = settings.providerInstances[provider.instanceId];
                      if (instance)
                        void mutateProvider({
                          environmentId,
                          input: {
                            providerInstanceMutation: {
                              operation: "upsert",
                              instanceId: provider.instanceId,
                              instance: {
                                ...instance,
                                enabled: true,
                                config: {
                                  ...(typeof instance.config === "object" &&
                                  instance.config !== null
                                    ? instance.config
                                    : {}),
                                  enabled: true,
                                },
                              },
                            },
                            patch: {},
                          },
                        }).then((result) => {
                          if (result._tag !== "Success")
                            setSelectionError("Could not enable this assistant. Please try again.");
                          else void refreshProviders({ environmentId, input: {} });
                        });
                    }
                  }}
                >
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
            1. Install the assistant if needed. 2. Sign in with your existing subscription in the
            window below. 3. When Ready appears, choose Use above. Your login stays on this device.
          </p>

          {environmentId && (
            <ConnectedAgentsStep
              environmentId={environmentId}
              machineLabel="Sign in to your assistant"
              marketingDriver={connect === "Claude" ? "claudeAgent" : "codex"}
            />
          )}
        </section>
      )}
      {selectionError && <p role="alert">{selectionError}</p>}
      <p>Gemini · Coming soon</p>
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
        <button>Continue</button>
        <p>Next, review your request and press Send to start your assistant.</p>
        {error && <p role="alert">{error}</p>}
      </form>
      <MarketingSubscriptions />
    </div>
  );
}

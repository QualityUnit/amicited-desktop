import { Menu, MenuTrigger, MenuPopup, MenuItem } from "./components/ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./components/ui/tooltip";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import {
  MarketingUiContext,
  MarketingButton,
  MarketingTextarea,
  SectionHead,
  MarketingIcon,
  toolIcon,
} from "@amicited/ui-marketing";
import type { ComponentProps } from "react";
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
import { useThreadShells, useProjects } from "./state/entities";
import { ConnectedAgentsStep } from "./components/onboarding/WelcomeWizard";
import { getOnboardingProviderState } from "./onboarding/providerReadiness.logic";
import type { ServerProvider } from "@t3tools/contracts";
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
  MarketingSearchContext,
  type SearchItem,
  useWorkspaceMode,
  resultTitle,
} from "@amicited/ui-marketing";
import type { ToolCard, ToolResult } from "@amicited/tools-core";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  Children,
  isValidElement,
  useEffect,
  useEffectEvent,
  useState,
  type ReactNode,
} from "react";
import { connectionAtomRuntime } from "./connection/runtime";
import { useAtomCommand } from "./state/use-atom-command";
import {
  useEnvironmentProviders,
  usePrimaryEnvironment,
  usePrimaryEnvironmentId,
} from "./state/environments";
import { useScratchProject } from "./hooks/useScratchProject";
import { useNewThreadHandler } from "./hooks/useHandleNewThread";

export const KitButton = ({
  variant = "outline",
  type = "submit",
  ...props
}: ComponentProps<typeof MarketingButton>) => (
  <Button
    type={type}
    size="amicited"
    variant={
      variant === "agent"
        ? "amicited-agent"
        : variant === "default"
          ? "amicited-primary"
          : variant === "row"
            ? "amicited-row"
            : variant === "link"
              ? "amicited-link"
              : "amicited-secondary"
    }
    data-am-variant={variant}
    {...props}
  />
);
const KitInput = ({ size: _size, ...props }: ComponentProps<"input">) => (
  <Input nativeInput size="amicited" {...props} />
);
export function KitTooltip({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        render={children as React.ReactElement}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      <TooltipPopup role="tooltip" side="right">
        {label}
      </TooltipPopup>
    </Tooltip>
  );
}
function KitMenu({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Menu>
      <MenuTrigger render={<Button size="amicited" variant="amicited-secondary" />}>
        {label}
      </MenuTrigger>
      <MenuPopup align="end">
        {Children.map(children, (child) =>
          isValidElement(child) ? <MenuItem render={child} /> : child,
        )}
      </MenuPopup>
    </Menu>
  );
}
const marketingUi = {
  Menu: KitMenu,
  Button: KitButton,
  Input: KitInput,
  Textarea,
  Tooltip: KitTooltip,
};

const renderCloudFooter = (result: ToolResult) => <CloudFooter result={result} />;

const listCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tools.list",
  label: "marketing:list",
});
const runCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.tools.run",
  label: "marketing:run",
});
function readRecent() {
  try {
    return JSON.parse(
      sessionStorage.getItem("amicited.last-result") ?? "null",
    ) as ToolResult | null;
  } catch {
    return null;
  }
}

function MarketingSearchData({ children }: { children: ReactNode }) {
  const environmentId = usePrimaryEnvironmentId();
  const list = useAtomCommand(listCommand);
  const load = useEffectEvent(list);
  const threads = useThreadShells();
  const [tools, setTools] = useState<readonly ToolCard[]>([]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Search reads the authenticated tool registry for this environment.
  useEffect(() => {
    if (!environmentId) return;
    let active = true;
    void load({ environmentId, input: undefined }).then((result) => {
      if (active && result._tag === "Success") setTools(result.value as unknown as ToolCard[]);
    });
    return () => {
      active = false;
    };
  }, [environmentId]);
  const [recent, setRecent] = useState(readRecent);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Refresh the browser-session result when a tool completes.
  useEffect(() => {
    const update = () => setRecent(readRecent());
    window.addEventListener("amicited-result", update);
    return () => window.removeEventListener("amicited-result", update);
  }, []);
  const items: SearchItem[] = tools.map((tool) => ({
    title: tool.title,
    href: "/tools/" + tool.name,
    kind: "Tool",
  }));
  if (recent && isUsefulResult(recent))
    items.unshift({
      title: resultTitle(recent),
      href: "/tools/" + recent.tool,
      kind: "Recent result",
    });
  items.push(
    ...threads.map((thread) => ({
      title: thread.title || "New task",
      href: `/${thread.environmentId}/${thread.id}`,
      kind: "Task" as const,
    })),
  );
  return <MarketingSearchContext value={items}>{children}</MarketingSearchContext>;
}
export function MarketingBoundary({ children }: { children: ReactNode }) {
  // AmICited extension: one role boundary owns navigation and settings visibility.
  const mode = useWorkspaceMode();
  const taskTarget = useThreadRouteTarget();
  const path = useLocation({ select: (location) => location.pathname });
  const hash = useLocation({ select: (location) => location.hash });
  const navigate = useNavigate();
  return mode === "marketer" ? (
    <MarketingUiContext value={marketingUi}>
      <MarketingSearchData>
        <ResultFooterContext value={renderCloudFooter}>
          <MarketingShell
            connectionStatus={<CloudStatusLine />}
            mode={mode}
            taskView={taskTarget !== null}
            path={path}
            hash={hash}
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
                  These limits come from your AI subscriptions. Local website checks do not use your
                  AI allowance.
                </p>
                <section className="am-card">
                  <MarketingSubscriptions usageLink={false} />
                </section>
              </div>
            ) : ["/pull-requests", "/source-control"].includes(path) ? (
              <MarketingHome />
            ) : (
              children
            )}
          </MarketingShell>
        </ResultFooterContext>
      </MarketingSearchData>
    </MarketingUiContext>
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
      assistantName={actions.assistantName}
      assistantsLoading={actions.assistantsLoading}
      startTask={(prompt) => actions.startTask(prompt, true)}
      subscriptions={<MarketingSubscriptions />}
      cloud={<CloudHome />}
      recent={
        recent && isUsefulResult(recent) ? (
          <Link
            to="/tools/$toolName"
            params={{ toolName: recent.tool }}
            className="am-finding am-recent-result"
          >
            <MarketingIcon name={toolIcon(recent.tool)} />
            <strong>{resultTitle(recent)}</strong>
            <span className="am-number">
              {typeof recent.output === "object" && recent.output && "score" in recent.output
                ? `${recent.output.score}/100`
                : "View results"}
            </span>
            <time dateTime={recent.startedAt}>
              {new Date(recent.startedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
            <MarketingIcon name="arrow" />
          </Link>
        ) : undefined
      }
    />
  );
}

export function MarketingTools({ name }: { name?: string }) {
  const selectedPack = useLocation({
    select: (location) => location.hash.replace(/^#/, "") || "seo",
  });
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
        <ToolsGrid tools={tools} selectedPack={selectedPack} />
        <CloudTools />
      </>
    );
  const tool = tools.find((tool) => tool.name === name);
  if (!tool)
    return (
      <>
        <h1>This tool is not available yet</h1>
        <p>Explore the tools available on this device.</p>
        <ToolsGrid tools={tools} selectedPack={selectedPack} />
      </>
    );
  return (
    <>
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
      {actions.taskError && (
        <section className="am-card" id="ai-subscriptions">
          <p role="alert">{actions.taskError}</p>
          <MarketingSubscriptions />
        </section>
      )}
    </>
  );
}
const renderModeSwitch = (checked: boolean, onChange: (checked: boolean) => void) => (
  <Switch aria-label="Developer features" checked={checked} onCheckedChange={onChange} />
);
export function MarketingSettings() {
  return <MarketingSettingsView modeControl={renderModeSwitch} />;
}

export function MarketingFirstRun() {
  const environment = usePrimaryEnvironment();
  const environmentId = usePrimaryEnvironmentId();
  const actions = useMarketingTask();
  const run = useAtomCommand(runCommand);
  const navigate = useNavigate();
  return (
    <MarketingUiContext value={marketingUi}>
      <MarketingSearchData>
        <ResultFooterContext value={renderCloudFooter}>
          <div data-amicited-shell="" className="am-first-run-surface">
            <FirstRun
              ready={environment?.connection.phase === "connected"}
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
          </div>
        </ResultFooterContext>
      </MarketingSearchData>
    </MarketingUiContext>
  );
}
function rememberResult(result: ToolResult) {
  if (!isUsefulResult(result)) return;
  try {
    sessionStorage.setItem("amicited.last-result", JSON.stringify(result));
    window.dispatchEvent(new Event("amicited-result"));
  } catch {
    /* Results remain visible when storage is blocked. */
  }
  localStorage.setItem("amicited.first-win", "true");
}
function useMarketingTask() {
  const environmentId = usePrimaryEnvironmentId();
  const scratch = useScratchProject();
  const newThread = useNewThreadHandler();
  const settings = usePrimarySettings();
  const allProviders = useEnvironmentProviders();
  const assistantsLoading = !environmentId || !allProviders.has(environmentId);
  const providers = environmentId ? (allProviders.get(environmentId) ?? []) : [];
  const readyProviders = providers.filter(
    (provider) =>
      getOnboardingProviderState(provider) === "ready" &&
      (provider.driver === "claudeAgent" ||
        provider.driver === "codex" ||
        provider.instanceId === settings.textGenerationModelSelection?.instanceId),
  );
  const assistant =
    readyProviders.find(
      (provider) => provider.instanceId === settings.textGenerationModelSelection?.instanceId,
    ) ?? readyProviders[0];
  const assistantName = assistant
    ? assistant.driver === "claudeAgent"
      ? "Claude"
      : assistant.driver === "codex"
        ? "ChatGPT"
        : assistant.displayName
    : undefined;
  const [taskError, setTaskError] = useState("");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Bring the connection card mounted by a blocked task into view.
  useEffect(() => {
    if (taskError) document.getElementById("ai-subscriptions")?.scrollIntoView({ block: "center" });
  }, [taskError]);
  const create = useAtomCommand(projectEnvironment.create);
  const environment = usePrimaryEnvironment();
  const projects = useProjects();
  const prepare = async (brand: Brand) => {
    if (!environmentId) throw new Error("Still connecting. Please try again.");
    const existing = projects.find(
      (p) => p.environmentId === environmentId && p.title === brand.name,
    );
    if (existing) return scopeProjectRef(existing.environmentId, existing.id);
    const workspaceRoot = environment?.serverConfig?.scratchWorkspaceRoot;
    if (!workspaceRoot) throw new Error("Still getting your workspace ready. Please try again.");
    const projectId = newProjectId();
    const result = await create({
      environmentId,
      input: {
        projectId,
        title: brand.name,
        workspaceRoot: workspaceRoot + "/" + new URL(brand.website).hostname,
        createWorkspaceRootIfMissing: true,
      },
    });
    if (result._tag !== "Success")
      throw new Error("Could not get your website ready. Please try again.");
    return scopeProjectRef(environmentId, projectId);
  };
  return {
    assistantName,
    assistantsLoading,
    taskError,
    prepare: async (brand: Brand) => {
      await prepare(brand);
    },
    startTask: async (prompt: string, sendImmediately = false) => {
      if (assistantsLoading) return;
      if (!assistant) {
        setTaskError("Connect Claude or ChatGPT to send this task");
        document.getElementById("ai-subscriptions")?.scrollIntoView({ block: "center" });
        throw new Error("Connect Claude or ChatGPT to send this task");
      }
      setTaskError("");
      const open = async (project: Parameters<typeof newThread>[0]) => {
        const draft = await newThread(project, {
          prompt,
          sendImmediately,
          modelSelection:
            settings.textGenerationModelSelection?.instanceId === assistant.instanceId
              ? settings.textGenerationModelSelection
              : resolveAppModelSelectionState(settings, [assistant]),
        });
        if (!draft) throw new Error("Could not open your task");
      };
      const brand = readBrand();
      if (brand) {
        await open(await prepare(brand));
        return;
      }
      if (!environmentId) throw new Error("Not connected");
      const project = await scratch.openScratchProject(environmentId);
      if (!project) throw new Error("Could not start task");
      await open(scopeProjectRef(project.environmentId, project.id));
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
  const [enabling, setEnabling] = useState(false);
  const enable = async (provider: ServerProvider | undefined) => {
    if (!provider || !environmentId) return;
    setEnabling(true);
    setSelectionError("");
    await (async () => {
      if (!provider.enabled) {
        const instance = settings.providerInstances[provider.instanceId];
        if (!instance) throw new Error("Assistant unavailable");
        const result = await mutateProvider({
          environmentId,
          input: {
            providerInstanceMutation: {
              operation: "upsert",
              instanceId: provider.instanceId,
              instance: {
                ...instance,
                enabled: true,
                config: {
                  ...(typeof instance.config === "object" && instance.config !== null
                    ? instance.config
                    : {}),
                  enabled: true,
                },
              },
            },
            patch: {},
          },
        });
        if (result._tag !== "Success") throw new Error("Could not enable assistant");
      }
      const refreshed = await refreshProviders({ environmentId, input: {} });
      if (refreshed._tag !== "Success") throw new Error("Could not refresh assistant");
    })().catch(() => setSelectionError("Could not connect this assistant. Please try again."));
    setEnabling(false);
  };
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
              {ready &&
              settings.textGenerationModelSelection?.instanceId === provider?.instanceId ? (
                <span className="am-status am-status-pass">In use</span>
              ) : ready ? (
                <MarketingButton
                  variant="link"
                  onClick={() =>
                    void choose(driver!).catch(() =>
                      setSelectionError("Could not save your assistant. Please try again."),
                    )
                  }
                >
                  {settings.textGenerationModelSelection?.instanceId === provider?.instanceId
                    ? `${label} selected`
                    : `Use ${label}`}
                </MarketingButton>
              ) : (
                <MarketingButton
                  onClick={() => {
                    setConnect(label ?? null);
                    void enable(provider);
                  }}
                >
                  Connect {label}
                </MarketingButton>
              )}
            </div>
          );
        })}
      </div>
      {connect &&
        !providers?.some(
          (p) =>
            p.driver === (connect === "Claude" ? "claudeAgent" : "codex") &&
            getOnboardingProviderState(p) === "ready" &&
            settings.textGenerationModelSelection?.instanceId === p.instanceId,
        ) && (
          <section className="am-card">
            <h2>Connect {connect}</h2>
            {connect === "Gemini" && !providers?.some((p) => p.driver === "gemini") && (
              <p>
                Gemini is not available in this installation yet. You can connect Claude or ChatGPT
                below, or keep using the free website checks.
              </p>
            )}
            <p>Connect with your existing subscription.</p>
            <ol className="list-decimal pl-5">
              <li>Install the assistant if needed.</li>
              <li>Sign in with your existing subscription in the window below.</li>
              <li>When Ready appears, select your assistant above.</li>
            </ol>
            <p>Your login stays on this machine.</p>

            {environmentId && (
              <ConnectedAgentsStep
                environmentId={environmentId}
                machineLabel="Sign in to your assistant"
                marketingDriver={connect === "Claude" ? "claudeAgent" : "codex"}
                marketingEnabling={enabling}
                onMarketingRetry={() =>
                  void enable(
                    providers?.find(
                      (p) => p.driver === (connect === "Claude" ? "claudeAgent" : "codex"),
                    ),
                  )
                }
              />
            )}
          </section>
        )}
      {selectionError && <p role="alert">{selectionError}</p>}
      <p>Gemini · Coming soon</p>
      {usageLink && <Link to="/usage">View AI plan usage →</Link>}
    </>
  );
}
export function MarketingNewTask() {
  const actions = useMarketingTask();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const visibleError =
    actions.assistantName && error === "Connect Claude or ChatGPT to send this task" ? "" : error;
  return (
    <div className="am-page">
      <p className="am-eyebrow">YOUR AI ASSISTANT</p>
      <h1>New task</h1>
      <p>Start with a goal, a question, or a rough idea.</p>
      <form
        className="am-card"
        onSubmit={(e) => {
          e.preventDefault();
          void actions.startTask(prompt, true).catch((error: Error) => setError(error.message));
        }}
      >
        <label>
          What do you want to get done?
          <MarketingTextarea
            autoFocus
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What do you want to get done?"
            required
          />
        </label>
        <MarketingButton variant="default" disabled={actions.assistantsLoading}>
          Send task
        </MarketingButton>
        {!visibleError && !actions.assistantsLoading && (
          <p>
            {actions.assistantName
              ? `${actions.assistantName} will start working on this`
              : "Connect an assistant first"}
          </p>
        )}
        {visibleError && (
          <p role="alert" className="am-status am-status-warn">
            {visibleError}
          </p>
        )}
      </form>
      <section className="am-card" id="ai-subscriptions">
        <SectionHead title="Your AI subscriptions" />
        <MarketingSubscriptions />
      </section>
    </div>
  );
}

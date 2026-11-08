import ThreadSidebar from "./components/Sidebar";
import {
  NewDomainDialog,
  DomainsSettings,
  DomainMigration,
  DomainFolderHeader,
  useDomains,
} from "./marketingDomains";
import { CloudDisclosure } from "./rpc/amicitedApprovals";
import { AppSidebarLayout, SidebarControl } from "./components/AppSidebarLayout";
import { isElectron } from "./env";
import { ToggleGroup, Toggle } from "./components/ui/toggle-group";
import { SettingsGroup } from "./components/settings/SettingsGroup";
import { SettingsRow } from "./components/settings/settingsLayout";
import { Collapsible, CollapsibleTrigger, CollapsiblePanel } from "./components/ui/collapsible";
import { ChevronRight, PlugZap } from "lucide-react";
import { ActivityShimmerOverlay } from "./components/chat/TimelineRowParts";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbText,
  WorkspaceBreadcrumbSeparator,
} from "./components/WorkspaceBreadcrumb";
import { Wrench, Settings } from "lucide-react";
import { WorkLogButton, WorkLogDetails } from "./components/chat/WorkLog";
import { Hammer } from "lucide-react";
import { SidebarChromeHeader } from "./components/sidebar/SidebarChrome";
import { SidebarHeaderIconButton } from "./components/sidebar/SidebarThreadHeader";
import {
  SidebarFooter,
  SidebarMenuButton,
  useSidebar,
  useSidebarVisibility,
} from "./components/ui/sidebar";
import { AmICitedMark } from "@amicited/ui-marketing";
import { Archive } from "lucide-react";
import { RelativeTime } from "./components/RelativeTime";
import { useArchivedThreadSnapshots } from "./lib/archivedThreadsState";
import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import { toastManager } from "./components/ui/toast";
import { useThreadActions } from "./hooks/useThreadActions";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { marketingReturnThread, saveMarketingReport } from "./marketingContext";
import { useThreadRouteRef } from "./hooks/useThreadRouteTarget";
import { useThreadShell, useThreadShells } from "./state/entities";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "./components/ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./components/ui/tooltip";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { MarketingUiContext, MarketingButton } from "@amicited/ui-marketing";
import type { ComponentProps } from "react";
import { useThreadRouteTarget } from "./hooks/useThreadRouteTarget";
import { isUsefulResult } from "@amicited/tools-core";
import { usePrimarySettings } from "./hooks/useSettings";
import { serverEnvironment } from "./state/server";
import { resolveAppModelSelectionState } from "./modelSelection";
import { Switch } from "./components/ui/switch";
import { Link } from "@tanstack/react-router";
/* oxlint-disable shadcn/no-unknown-classes -- Marketing classes are supplied by @amicited/ui-marketing, independent of the upstream Tailwind theme. */
import { CloudPage } from "./rpc/amicitedCloud";

import { useComposerDraftStore } from "./composerDraftStore";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { ConnectedAgentsStep } from "./components/onboarding/WelcomeWizard";
import { getOnboardingProviderState } from "./onboarding/providerReadiness.logic";
import type { ServerProvider } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import {
  ToolsGrid,
  ToolForm,
  MarketingSettings as MarketingSettingsView,
  MarketingShell,
  useWorkspaceMode,
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
  useConnectedEnvironmentIds,
  useEnvironmentProviders,
  usePrimaryEnvironment,
  usePrimaryEnvironmentId,
} from "./state/environments";
import { useScratchProject } from "./hooks/useScratchProject";
import { useNewThreadHandler } from "./hooks/useHandleNewThread";

const KitButton = ({
  variant = "outline",
  type = "submit",
  size = "sm",
  ...props
}: ComponentProps<typeof MarketingButton>) => (
  <Button
    type={type}
    size={size}
    variant={
      variant === "header"
        ? "media-navigation"
        : variant === "agent"
          ? "warning-outline"
          : variant === "default"
            ? "default"
            : variant === "row"
              ? "ghost"
              : variant === "link"
                ? "ghost-muted"
                : "outline"
    }
    data-am-variant={variant}
    {...props}
  />
);
const KitInput = ({ size: _size, ...props }: ComponentProps<"input">) => (
  <Input nativeInput size="sm" {...props} />
);
function KitTooltip({ children, label }: { children: ReactNode; label: string }) {
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
      <MenuTrigger render={<Button size="icon-xs" variant="ghost" />}>{label}</MenuTrigger>
      <MenuPopup align="end">
        {Children.map(children, (child) =>
          isValidElement(child) ? <MenuItem render={child} /> : child,
        )}
      </MenuPopup>
    </Menu>
  );
}
function KitWorkDisclosure({
  label,
  children,
  pending,
  defaultOpen = false,
}: {
  label: ReactNode;
  children: ReactNode;
  pending?: boolean | undefined;
  defaultOpen?: boolean | undefined;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger
        render={
          <WorkLogButton
            aria-expanded={expanded}
            icon={<Hammer className="size-4 text-icon-muted" />}
            label={
              pending ? (
                <span className="relative">
                  {label}
                  <ActivityShimmerOverlay>{label}</ActivityShimmerOverlay>
                </span>
              ) : (
                label
              )
            }
            trailing={
              <ChevronRight
                className={
                  expanded
                    ? "size-3 rotate-90 text-muted-foreground"
                    : "size-3 text-muted-foreground"
                }
              />
            }
          />
        }
      />
      <CollapsiblePanel animate={false}>
        <WorkLogDetails>{children}</WorkLogDetails>
      </CollapsiblePanel>
    </Collapsible>
  );
}
function KitBreadcrumb({ children }: { children: ReactNode }) {
  const ref = useThreadRouteRef();
  const thread = useThreadShell(ref);
  const { rows } = useDomains(ref?.environmentId);
  const domain = rows.find((row) => row.projectId === thread?.projectId);
  return (
    <WorkspaceBreadcrumb ariaLabel="Workspace">
      <WorkspaceBreadcrumbItem>
        <WorkspaceBreadcrumbText>{domain?.hostname ?? "Your workspace"}</WorkspaceBreadcrumbText>
      </WorkspaceBreadcrumbItem>
      <WorkspaceBreadcrumbSeparator />
      <WorkspaceBreadcrumbItem current>
        <WorkspaceBreadcrumbText>{children}</WorkspaceBreadcrumbText>
      </WorkspaceBreadcrumbItem>
    </WorkspaceBreadcrumb>
  );
}
const marketingUi = {
  Categories: ({
    value,
    items,
    onChange,
  }: {
    value: string;
    items: readonly (readonly [string, string])[];
    onChange: (value: string) => void;
  }) => (
    <ToggleGroup
      aria-label="Tool categories"
      value={[value]}
      onValueChange={(values) => {
        if (values[0]) onChange(values[0]);
      }}
    >
      {items.map(([key, label]) => (
        <Toggle key={key} value={key}>
          {label}
        </Toggle>
      ))}
    </ToggleGroup>
  ),
  SettingsGroup,
  SettingsRow,
  WorkDisclosure: KitWorkDisclosure,
  Disclosure: CloudDisclosure,
  Breadcrumb: KitBreadcrumb,
  Menu: KitMenu,
  Button: KitButton,
  Input: KitInput,
  Textarea,
  Tooltip: KitTooltip,
};

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
  const [archived, setArchived] = useState(false);

  const taskTarget = useThreadRouteTarget();
  const path = useLocation({ select: (location) => location.pathname });
  const hash = useLocation({ select: (location) => location.hash });
  const navigate = useNavigate();
  return mode === "marketer" ? (
    <MarketingUiContext value={marketingUi}>
      <AppSidebarLayout
        marketer
        sidebarContent={
          <>
            <SidebarChromeHeader
              isElectron={isElectron}
              brand={
                <span
                  data-amicited-brand=""
                  className="ml-[var(--workspace-titlebar-content-left)] inline-flex h-7 items-center text-sm font-medium tracking-tight text-white"
                >
                  <AmICitedMark />
                </span>
              }
            />
            <MarketingHistory archived={archived} setArchived={setArchived} />
            <SidebarFooter>
              <div className="flex gap-2">
                {[
                  ["Settings", "/settings/general", Settings],
                  ["Tools", "/tools", Wrench],
                  ["AmICited", "/marketing-settings", PlugZap],
                ].map(([label, href, Icon]) => (
                  <SidebarMenuButton
                    key={String(label)}
                    size="icon"
                    aria-label={String(label)}
                    render={<a href={String(href)} />}
                    onClick={(event) => {
                      event.preventDefault();
                      void navigate({ to: String(href) });
                    }}
                  >
                    {typeof Icon !== "string" && Icon && <Icon />}
                  </SidebarMenuButton>
                ))}
              </div>
            </SidebarFooter>
          </>
        }
      >
        <DomainMigration />
        <MarketerShell
          externalSidebar
          desktop={isElectron}
          headerTitle={archived ? "Archived chats" : undefined}
          mode={mode}
          taskView={taskTarget !== null}
          path={path}
          hash={hash}
          navigate={(path) => {
            setArchived(false);
            void navigate({ to: path });
          }}
        >
          {archived ? (
            <MarketingArchive />
          ) : path === "/marketing-settings" ? (
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
        </MarketerShell>
      </AppSidebarLayout>
    </MarketingUiContext>
  ) : (
    children
  );
}
export function MarketerShell(props: ComponentProps<typeof MarketingShell>) {
  const { toggleSidebar, setOpen, setOpenMobile, isMobile } = useSidebar();
  const visible = useSidebarVisibility();
  return (
    <MarketingShell
      {...props}
      sidebar={{
        collapsed: !visible,
        toggle: toggleSidebar,
        expand: () => (isMobile ? setOpenMobile(true) : setOpen(true)),
        control: <SidebarControl marketer />,
      }}
    />
  );
}

export function MarketingHome() {
  const environmentId = usePrimaryEnvironmentId();
  const environment = usePrimaryEnvironment();
  const scratch = useScratchProject();
  const domains = useDomains();
  const newThread = useNewThreadHandler();
  const [newDomainOpen, setNewDomainOpen] = useState(false);
  const open = useEffectEvent(async () => {
    if (!environmentId) return;
    const domain = domains.rows[0];
    if (domain) await newThread(scopeProjectRef(environmentId, ProjectId.make(domain.projectId)));
    else if (scratch.scratchWorkspaceRootFor(environmentId))
      await scratch.startScratchThread(environmentId);
  });
  const [error, setError] = useState("");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Open the implicit workspace through the existing project service once the environment connects.
  useEffect(() => {
    if (environment?.connection.phase === "connected")
      void open().catch(() => setError("Could not open your chat. Please try again."));
  }, [environment?.connection.phase]);
  if (
    environment?.connection.phase === "connected" &&
    !scratch.scratchWorkspaceRootFor(environmentId) &&
    !domains.rows.length
  )
    return (
      <div className="am-page">
        <NewDomainDialog open={newDomainOpen} onOpenChange={setNewDomainOpen} />
        <Button onClick={() => setNewDomainOpen(true)}>New domain</Button>
      </div>
    );
  return error ? <p role="alert">{error}</p> : <p role="status">Opening your chat…</p>;
}

export function MarketingTools({ name }: { name?: string }) {
  const selectedPack = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get("category") || "seo",
  });
  const navigate = useNavigate();
  const threads = useThreadShells();
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
        <ToolsGrid
          tools={tools}
          selectedPack={selectedPack}
          navigate={(to) => void navigate({ to })}
        />
      </>
    );
  const tool = tools.find((tool) => tool.name === name);
  if (!tool)
    return (
      <>
        <h1>This tool is not available yet</h1>
        <p>Explore the tools available on this device.</p>
        <ToolsGrid
          tools={tools}
          selectedPack={selectedPack}
          navigate={(to) => void navigate({ to })}
        />
      </>
    );
  return (
    <>
      <ToolForm
        fix={async (prompt, report) => {
          const resultPath = sessionStorage.getItem("amicited.result-origin." + report.id);
          const origin = marketingReturnThread(resultPath, threads);
          if (resultPath && origin) {
            const environment = origin.environmentId;
            const thread = origin.id;
            {
              useComposerDraftStore.getState().setPrompt(
                {
                  environmentId: EnvironmentId.make(environment),
                  threadId: ThreadId.make(thread),
                },
                prompt,
              );
              saveMarketingReport({ environmentId: environment, threadId: thread }, report);
              await navigate({ to: resultPath });
              return;
            }
          }
          await actions.startTask(prompt, false, report);
        }}
        fullResult={Boolean(sessionStorage.getItem("amicited.last-result"))}
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
    </>
  );
}
const renderModeSwitch = (checked: boolean, onChange: (checked: boolean) => void) => (
  <Switch aria-label="Developer features" checked={checked} onCheckedChange={onChange} />
);
export function MarketingSettings() {
  return <MarketingSettingsView modeControl={renderModeSwitch} domains={<DomainsSettings />} />;
}

export function MarketingFirstRun() {
  return <MarketingHome />;
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
export function useMarketingTask() {
  const environmentId = usePrimaryEnvironmentId();
  const scratch = useScratchProject();
  const newThread = useNewThreadHandler();
  const settings = usePrimarySettings();
  const allProviders = useEnvironmentProviders();
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
  return {
    startTask: async (prompt: string, sendImmediately = false, report?: unknown) => {
      const open = async (project: Parameters<typeof newThread>[0]) => {
        const draft = await newThread(project, {
          prompt,
          sendImmediately: sendImmediately && Boolean(assistant),
          ...(assistant
            ? {
                modelSelection:
                  settings.textGenerationModelSelection?.instanceId === assistant.instanceId
                    ? settings.textGenerationModelSelection
                    : resolveAppModelSelectionState(settings, [assistant]),
              }
            : {}),
        });
        if (!draft) throw new Error("Could not open your task");
        if (report)
          saveMarketingReport(
            { environmentId: project.environmentId, threadId: draft.threadId },
            report,
          );
      };
      if (!environmentId) throw new Error("Not connected");
      const project = await scratch.openScratchProject(environmentId);
      if (!project) throw new Error("Could not start task");
      await open(scopeProjectRef(project.environmentId, project.id));
    },
  };
}
export function MarketingSubscriptions({
  usageLink = true,
  initialDriver,
  onSelected,
}: {
  usageLink?: boolean;
  initialDriver?: "claudeAgent" | "codex";
  onSelected?: (selection: import("@t3tools/contracts").ModelSelection) => void;
}) {
  const environmentId = usePrimaryEnvironmentId();
  const all = useEnvironmentProviders();
  const providers = environmentId ? all.get(environmentId) : undefined;
  const [connect, setConnect] = useState<string | null>(
    initialDriver ? (initialDriver === "codex" ? "ChatGPT" : "Claude") : null,
  );
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
  const enableInitial = useEffectEvent(() => {
    if (initialDriver) void enable(providers?.find((p) => p.driver === initialDriver));
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep the selected assistant's external authentication setup in step with the mounted connection panel.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- External authentication reports pending state before its asynchronous handshake.
    if (initialDriver) enableInitial();
  }, [initialDriver]);
  const choose = async (driver: string) => {
    const candidates = providers?.filter((p) => p.driver === driver) ?? [];
    const selection = resolveAppModelSelectionState(settings, candidates);
    if (!environmentId || !candidates.length) return;
    const result = await update({
      environmentId,
      input: { patch: { textGenerationModelSelection: selection } },
    });
    if (result._tag !== "Success") throw new Error("Could not save assistant");
    onSelected?.(selection);
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
                  type="button"
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
                  type="button"
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
      {usageLink && <Link to="/usage">View AI plan usage →</Link>}
    </>
  );
}
export function MarketingNewTask() {
  return <MarketingHome />;
}

function MarketingHistory({
  archived,
  setArchived,
}: {
  archived: boolean;
  setArchived: (value: boolean) => void;
}) {
  const domains = useDomains();
  const navigate = useNavigate();
  const [newDomainOpen, setNewDomainOpen] = useState(false);
  const [routeReveal] = useState(() => ({ observedKey: null, pendingKey: null }));
  return (
    <>
      <NewDomainDialog open={newDomainOpen} onOpenChange={setNewDomainOpen} />
      <ThreadSidebar
        routeReveal={routeReveal}
        onNewDomain={() => setNewDomainOpen(true)}
        resolveThreadLocation={(thread) => {
          const folder = domains.rows.find((row) => row.projectId === thread.projectId)?.siteFiles;
          return folder ? folder.split(/[\\/]/).filter(Boolean).at(-1) : null;
        }}
        archiveAction={
          <SidebarHeaderIconButton
            label={archived ? "Back to chats" : "Archived"}
            onClick={() => {
              setArchived(!archived);
              void navigate({ to: "/home" });
            }}
          >
            <Archive />
          </SidebarHeaderIconButton>
        }
        renderProjectFolder={(props) => {
          const domain = domains.rows.find((row) => row.projectId === props.group.id);
          return domain ? (
            <DomainFolderHeader
              {...props}
              domain={domain}
              destination={props.group.environmentId}
            />
          ) : null;
        }}
      />
    </>
  );
}

function MarketingArchive() {
  const environmentIds = useConnectedEnvironmentIds();
  const { snapshots } = useArchivedThreadSnapshots(environmentIds);
  const { unarchiveThread, confirmAndDeleteThread } = useThreadActions();
  const threads = snapshots.flatMap(({ environmentId, snapshot }) =>
    snapshot.threads.map((thread) => presentThreadShell(environmentId, thread)),
  );
  const act = async (operation: Promise<{ _tag: string }>) => {
    if ((await operation)._tag === "Failure")
      toastManager.add({ type: "error", title: "Could not update chat. Please try again." });
  };
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Archived chats stay here until you restore or delete them.
      </p>
      {threads.length ? (
        <SettingsGroup>
          {threads.map((thread) => {
            const ref = scopeThreadRef(thread.environmentId, thread.id);
            return (
              <SettingsRow
                key={thread.environmentId + thread.id}
                title={thread.title}
                description={<RelativeTime timestamp={thread.updatedAt} />}
                control={
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void act(unarchiveThread(ref))}
                    >
                      Restore
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() =>
                        void act(
                          confirmAndDeleteThread(ref, { forceConfirm: true, marketer: true }),
                        )
                      }
                    >
                      Delete
                    </Button>
                  </div>
                }
              />
            );
          })}
        </SettingsGroup>
      ) : (
        <p>No archived chats</p>
      )}
    </>
  );
}

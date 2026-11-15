import { PRIMARY_LOCAL_ENVIRONMENT_ID } from "@t3tools/contracts";
import { useEnvironmentSettings } from "./hooks/useSettings";
import { lastDomains, readDefaultDomain } from "./marketingDomainStore";
import { MarketingSetupHost, readSetup } from "./marketingSetup";
import { ProviderDriverKind } from "@t3tools/contracts";
import { ProviderModelPicker } from "./components/chat/ProviderModelPicker";
import { ProviderInstanceIcon } from "./components/chat/ProviderInstanceIcon";
import { deriveProviderInstanceEntries } from "./providerInstances";
import { getAppModelOptionsForInstance } from "./modelSelection";
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
import { Settings, FileText } from "lucide-react";
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
import { saveMarketingReport } from "./marketingContext";
import { useThreadRouteRef } from "./hooks/useThreadRouteTarget";
import { useThreadShell } from "./state/entities";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "./components/ui/menu";
import { Tooltip, TooltipTrigger, TooltipPopup } from "./components/ui/tooltip";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { MarketingUiContext, MarketingButton } from "@amicited/ui-marketing";
import type { ComponentProps } from "react";
import { useThreadRouteTarget } from "./hooks/useThreadRouteTarget";
import { usePrimarySettings } from "./hooks/useSettings";
import { serverEnvironment } from "./state/server";
import { effectiveMarketingAssistant, recommendedMarketingAssistant } from "./marketingAssistant";
import {
  ComposerEffortColumn,
  describeComposerEffort,
} from "./components/chat/ComposerModelEffort";
import type { TraitsSelectionInput } from "./components/chat/TraitsPicker";
import { Switch } from "./components/ui/switch";
import { Link } from "@tanstack/react-router";
/* oxlint-disable shadcn/no-unknown-classes -- Marketing classes are supplied by @amicited/ui-marketing, independent of the upstream Tailwind theme. */
import { CloudPage } from "./rpc/amicitedCloud";

import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { ConnectedAgentsStep } from "./components/onboarding/WelcomeWizard";
import { getOnboardingProviderState } from "./onboarding/providerReadiness.logic";
import {
  MarketingSettings as MarketingSettingsView,
  MarketingShell,
  useWorkspaceMode,
} from "@amicited/ui-marketing";
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
import { useAtomCommand } from "./state/use-atom-command";
import {
  useConnectedEnvironmentIds,
  useEnvironmentProviders,
  usePrimaryEnvironment,
  usePrimaryEnvironmentId,
} from "./state/environments";
import { useScratchProject } from "./hooks/useScratchProject";
import { useNewThreadHandler } from "./hooks/useHandleNewThread";
import { IssuesPage, IssuesSidebarRow } from "./marketingIssues";

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
      <MarketingSetupHost>
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
              <IssuesSidebarRow
                active={path.startsWith("/issues")}
                onOpen={() => {
                  setArchived(false);
                  void navigate({ to: "/issues" });
                }}
              />
              <MarketingHistory archived={archived} setArchived={setArchived} />
              <SidebarFooter>
                <div className="flex gap-2">
                  {[
                    ["Settings", "/settings/general", Settings],
                    ["Reports", "/reports", FileText],
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
            headerTitle={
              archived ? "Archived chats" : path.startsWith("/reports") ? "Reports" : undefined
            }
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
            ) : path === "/issues" ? (
              <IssuesPage />
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
      </MarketingSetupHost>
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
  const loadSetup = useAtomCommand(readSetup);
  const [newDomainOpen, setNewDomainOpen] = useState(false);
  const open = useEffectEvent(async () => {
    if (!environmentId) return;
    const setup = await loadSetup({ environmentId, input: undefined });
    if (setup._tag === "Success" && setup.value.lastDomain)
      lastDomains.set(environmentId, setup.value.lastDomain);
    const domain = readDefaultDomain(environmentId);
    if (domain) await newThread(scopeProjectRef(environmentId, ProjectId.make(domain.projectId)));
    else if (scratch.scratchWorkspaceRootFor(environmentId))
      await scratch.startScratchThread(environmentId);
  });
  const [error, setError] = useState("");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Open the implicit workspace through the existing project service once the environment connects.
  useEffect(() => {
    if (environment?.connection.phase === "connected" && domains.loaded)
      void open().catch(() => setError("Could not open your chat. Please try again."));
  }, [environment?.connection.phase, domains.loaded]);
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

const renderModeSwitch = (checked: boolean, onChange: (checked: boolean) => void) => (
  <Switch aria-label="Developer features" checked={checked} onCheckedChange={onChange} />
);
export function MarketingSettings() {
  const [newDomainOpen, setNewDomainOpen] = useState(false);
  return (
    <>
      <NewDomainDialog open={newDomainOpen} onOpenChange={setNewDomainOpen} />
      <div className="flex gap-2 p-4">
        <Button onClick={() => setNewDomainOpen(true)}>Add domain</Button>
        <Button
          variant="outline"
          onClick={() => window.dispatchEvent(new Event("amicited-run-setup"))}
        >
          Run setup again
        </Button>
      </div>
      <MarketingSettingsView modeControl={renderModeSwitch} domains={<DomainsSettings />} />
    </>
  );
}

export function MarketingFirstRun() {
  return (
    <>
      <MarketingSetupHost />
      <MarketingHome />
    </>
  );
}
export function useMarketingTask() {
  const environmentId = usePrimaryEnvironmentId();
  const scratch = useScratchProject();
  const newThread = useNewThreadHandler();
  const settings = usePrimarySettings();
  const allProviders = useEnvironmentProviders();
  const providers = environmentId ? (allProviders.get(environmentId) ?? []) : [];
  const assistant = effectiveMarketingAssistant(settings, providers);
  return {
    startTask: async (prompt: string, sendImmediately = false, report?: unknown) => {
      const open = async (project: Parameters<typeof newThread>[0]) => {
        const draft = await newThread(project, {
          prompt,
          sendImmediately: sendImmediately && Boolean(assistant),
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
  onSelected,
  onReadyChange,
  initialDriver,
  destination,
}: {
  destination?: import("@t3tools/contracts").EnvironmentId | null | undefined;
  usageLink?: boolean;
  initialDriver?: "claudeAgent" | "codex";
  showIntro?: boolean;
  onReadyChange?: (ready: boolean) => void;
  onSelected?: (selection: import("@t3tools/contracts").ModelSelection) => void;
}) {
  const primary = usePrimaryEnvironmentId();
  const environmentId = destination ?? primary;
  const all = useEnvironmentProviders();
  const providers = environmentId ? (all.get(environmentId) ?? []) : [];
  const settings = useEnvironmentSettings(
    EnvironmentId.make(environmentId ?? PRIMARY_LOCAL_ENVIRONMENT_ID),
  );
  const effective = effectiveMarketingAssistant(settings, providers);
  const [driverChoice, setDriverChoice] = useState<"claudeAgent" | "codex" | null>(
    initialDriver ?? null,
  );
  const driver =
    driverChoice ??
    (providers.find((p) => p.instanceId === effective?.instanceId)?.driver === "codex"
      ? "codex"
      : "claudeAgent");
  const provider =
    providers.find((p) => p.driver === driver && getOnboardingProviderState(p) === "ready") ??
    providers.find((p) => p.driver === driver);
  const ready = getOnboardingProviderState(provider) === "ready";
  const selection = provider
    ? effective?.instanceId === provider.instanceId
      ? effective
      : recommendedMarketingAssistant(provider)
    : null;
  const update = useAtomCommand(serverEnvironment.updateSettings);
  const [error, setError] = useState("");
  const entries = deriveProviderInstanceEntries(providers);
  const reportReady = useEffectEvent((value: boolean) => onReadyChange?.(value));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The setup shell gates Continue on the provider selected inside this shared dialog body.
  useEffect(() => {
    reportReady(ready);
  }, [ready]);
  const choose = async (selection: import("@t3tools/contracts").ModelSelection) => {
    if (!environmentId) return;
    const result = await update({
      environmentId,
      input: { patch: { defaultModelSelection: selection } },
    });
    if (result._tag !== "Success") {
      setError("Could not save your assistant. Please try again.");
      return;
    }
    setError("");
    window.dispatchEvent(
      new CustomEvent("amicited-assistant-selected", { detail: { environmentId, selection } }),
    );
    onSelected?.(selection);
  };
  const saveConnectedChoice = useEffectEvent(
    async (choice: string | null, isReady: boolean, instanceId: string | undefined) => {
      if (choice && isReady && selection && effective?.instanceId !== instanceId)
        await choose(selection);
    },
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Provider login completes outside React; persist the user's provider choice when it becomes ready.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Login readiness synchronizes the external server setting; save errors are reported after its RPC completes.
    void saveConnectedChoice(driverChoice, ready, provider?.instanceId);
  }, [driverChoice, ready, provider?.instanceId]);
  const traits: TraitsSelectionInput | null =
    provider && selection
      ? {
          provider: provider.driver,
          instanceId: provider.instanceId,
          models: provider.models,
          model: selection.model,
          modelOptions: selection.options,
          planModeEnabled: false,
          onModelOptionsChange: (options) => void choose({ ...selection, options: options ?? [] }),
        }
      : null;
  const effort = describeComposerEffort(traits, "label", "sm");
  const label = driver === "codex" ? "ChatGPT" : "Claude";
  return (
    <section className="am-assistant-hero" aria-label="Assistant setup">
      <div className="am-assistant-logo">
        <ProviderInstanceIcon
          driverKind={ProviderDriverKind.make(driver)}
          displayName={label}
          iconClassName="size-14"
        />
        {ready && (
          <span className="am-assistant-ready" aria-label="Ready">
            ✓
          </span>
        )}
      </div>
      <header>
        <h1>{ready ? `${label} is ready` : `Connect ${label}`}</h1>
        <p className="text-sm text-muted-foreground">Your subscription. No API key.</p>
      </header>
      <div className="am-assistant-switch" role="radiogroup" aria-label="Assistant">
        {(["claudeAgent", "codex"] as const).map((choice) => (
          <button
            type="button"
            role="radio"
            aria-label={choice === "codex" ? "ChatGPT" : "Claude"}
            aria-checked={choice === driver}
            key={choice}
            onKeyDown={(event) => {
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                event.currentTarget.parentElement
                  ?.querySelector<HTMLButtonElement>(`[aria-checked="false"]`)
                  ?.click();
                event.currentTarget.parentElement
                  ?.querySelector<HTMLButtonElement>(`[aria-checked="true"]`)
                  ?.focus();
              }
            }}
            onClick={() => {
              setDriverChoice(choice);
              const next = providers.find(
                (p) => p.driver === choice && getOnboardingProviderState(p) === "ready",
              );
              if (next)
                void choose(
                  effective?.instanceId === next.instanceId
                    ? effective
                    : recommendedMarketingAssistant(next),
                );
            }}
          >
            <ProviderInstanceIcon
              driverKind={ProviderDriverKind.make(choice)}
              displayName={choice === "codex" ? "ChatGPT" : "Claude"}
              iconClassName="size-6"
            />
          </button>
        ))}
      </div>
      {ready && selection ? (
        <div className="am-assistant-preview" aria-label="Chat preview">
          <span className="text-muted-foreground">Ask anything…</span>
          <div className="am-assistant-preview-controls">
            <ProviderModelPicker
              environmentId={environmentId ?? null}
              activeInstanceId={selection.instanceId}
              model={selection.model}
              lockedProvider={ProviderDriverKind.make(driver)}
              instanceEntries={entries.filter((entry) => entry.driverKind === driver)}
              modelOptionsByInstance={
                new Map(
                  entries.map((entry) => [
                    entry.instanceId,
                    getAppModelOptionsForInstance(settings, entry),
                  ]),
                )
              }
              showTriggerSuffix
              triggerClassName="max-w-full sm:max-w-full"
              triggerSuffix={<span>· {effort.detail ?? "Default"} ▾</span>}
              triggerDetail={effort.detail}
              effortColumn={<ComposerEffortColumn traits={traits} />}
              onInstanceModelChange={(instanceId, model) =>
                void choose({ instanceId, model, options: selection.options ?? [] })
              }
            />
            <span className="am-assistant-hint">← change any time</span>
          </div>
        </div>
      ) : environmentId ? (
        <ConnectedAgentsStep
          environmentId={environmentId}
          machineLabel={label}
          marketingDriver={driver}
        />
      ) : (
        <p>Connecting to this computer…</p>
      )}
      {error && <p role="alert">{error}</p>}
      {usageLink && <Link to="/usage">View AI plan usage →</Link>}
    </section>
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
          const location = thread.worktreePath ?? folder;
          return location ? location.split(/[\\/]/).filter(Boolean).at(-1) : null;
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

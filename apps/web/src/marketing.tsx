import { MoreHorizontal } from "lucide-react";
import { useArchivedThreadSnapshots } from "./lib/archivedThreadsState";
import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import { toastManager } from "./components/ui/toast";
import { useThreadActions } from "./hooks/useThreadActions";
import { useOrchestrationCommand } from "./state/use-orchestration-command";
import { threadEnvironment } from "./state/threads";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  marketingReturnThread,
  saveMarketingReport,
  marketingHistoryStatus,
} from "./marketingContext";
import { useThreadShells } from "./state/entities";
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
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
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
const marketingUi = {
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
      <MarketingShell
        history={<MarketingHistory archived={archived} setArchived={setArchived} />}
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
          <div className="am-secondary-page">
            <h1>Archived chats</h1>
            <p>Archived chats stay here until you restore or delete them.</p>
          </div>
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
              These limits come from your AI subscriptions. Local website checks do not use your AI
              allowance.
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
    </MarketingUiContext>
  ) : (
    children
  );
}
export function MarketingHome() {
  const environmentId = usePrimaryEnvironmentId();
  const environment = usePrimaryEnvironment();
  const scratch = useScratchProject();
  const open = useEffectEvent(async () => {
    if (environmentId) await scratch.startScratchThread(environmentId);
  });
  const [error, setError] = useState("");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Open the implicit workspace through the existing project service once the environment connects.
  useEffect(() => {
    if (environment?.connection.phase === "connected")
      void open().catch(() => setError("Could not open your chat. Please try again."));
  }, [environment?.connection.phase]);
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
  return <MarketingSettingsView modeControl={renderModeSwitch} />;
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
function useMarketingTask() {
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
      <p>Gemini · Coming soon</p>
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
  const activeThreads = useThreadShells();
  const environmentIds = useConnectedEnvironmentIds();
  const { snapshots } = useArchivedThreadSnapshots(environmentIds);
  const threads = archived
    ? snapshots.flatMap(({ environmentId, snapshot }) =>
        snapshot.threads.map((thread) => presentThreadShell(environmentId, thread)),
      )
    : activeThreads.filter((thread) => !thread.archivedAt);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const path = useLocation({ select: (location) => location.pathname });
  const { archiveThread, unarchiveThread, confirmAndDeleteThread } = useThreadActions();
  const act = async (operation: Promise<{ _tag: string }>) => {
    if ((await operation)._tag === "Failure")
      toastManager.add({ type: "error", title: "Could not update chat. Please try again." });
  };
  const update = useOrchestrationCommand(threadEnvironment.updateMetadata);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const sorted = threads.toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const [today] = useState(() => new Date().toDateString());
  return (
    <div className="am-flat-history">
      <MarketingButton
        type="button"
        className="am-archive-toggle"
        onClick={() => {
          setArchived(!archived);
          void navigate({ to: "/home" });
        }}
      >
        {archived ? "Back to chats" : "Archived"}
      </MarketingButton>
      <Input
        aria-label="Search chats"
        placeholder="Search chats"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {!threads.length && (
        <p className="am-history-empty">{archived ? "No archived chats" : "No chats yet"}</p>
      )}
      {["Today", "Earlier"].map((group) => {
        const rows = sorted.filter(
          (thread) =>
            (new Date(Date.parse(thread.updatedAt)).toDateString() === today
              ? "Today"
              : "Earlier") === group && thread.title.toLowerCase().includes(search.toLowerCase()),
        );
        return rows.length ? (
          <section key={group}>
            <small>{group}</small>
            {rows.map((thread) => {
              const ref = scopeThreadRef(thread.environmentId, thread.id);
              const key = thread.environmentId + thread.id;
              return (
                <div
                  className="am-history-row"
                  data-selected={
                    decodeURIComponent(path) === `/${thread.environmentId}/${thread.id}`
                  }
                  key={key}
                >
                  {renaming === key ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (title.trim())
                          void update({
                            environmentId: thread.environmentId,
                            input: { threadId: thread.id, title: title.trim() },
                          }).then((result) => {
                            if (result._tag === "Success") setRenaming(null);
                          });
                      }}
                    >
                      <Input
                        aria-label="Chat name"
                        autoFocus
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setRenaming(null);
                        }}
                      />
                      <MarketingButton type="submit">Save</MarketingButton>
                    </form>
                  ) : (
                    <>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              data-chat-history-link=""
                              aria-current={
                                decodeURIComponent(path) === `/${thread.environmentId}/${thread.id}`
                                  ? "page"
                                  : undefined
                              }
                              onKeyDown={(event) => {
                                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                                  return;
                                const buttons = Array.from(
                                  event.currentTarget
                                    .closest(".am-flat-history")
                                    ?.querySelectorAll<HTMLButtonElement>(
                                      "[data-chat-history-link]",
                                    ) ?? [],
                                );
                                const index = buttons.indexOf(event.currentTarget);
                                const next =
                                  event.key === "Home"
                                    ? 0
                                    : event.key === "End"
                                      ? buttons.length - 1
                                      : (index +
                                          (event.key === "ArrowDown" ? 1 : -1) +
                                          buttons.length) %
                                        buttons.length;
                                event.preventDefault();
                                buttons[next]?.focus();
                              }}
                              onClick={() => {
                                setArchived(false);
                                void navigate({
                                  to: "/$environmentId/$threadId",
                                  params: {
                                    environmentId: thread.environmentId,
                                    threadId: thread.id,
                                  },
                                });
                              }}
                            >
                              <span>
                                {thread.title === "New thread" ? "New chat" : thread.title}
                              </span>
                              <MarketingHistoryStatus thread={thread} />
                            </button>
                          }
                        />
                        <TooltipPopup>
                          {thread.title === "New thread" ? "New chat" : thread.title}
                        </TooltipPopup>
                      </Tooltip>
                      {archived && (
                        <MarketingButton
                          variant="link"
                          className="am-restore-chat"
                          onClick={() => void act(unarchiveThread(ref))}
                        >
                          Restore
                        </MarketingButton>
                      )}
                      <Menu>
                        <MenuTrigger
                          aria-label={`Chat actions for ${thread.title}`}
                          render={<Button size="icon-xs" variant="ghost" />}
                        >
                          <MoreHorizontal size={16} />
                        </MenuTrigger>
                        <MenuPopup data-amicited-tokens="" data-amicited-popup="">
                          <MenuItem
                            onClick={() => {
                              setTitle(thread.title);
                              setRenaming(key);
                            }}
                          >
                            Rename
                          </MenuItem>
                          <MenuItem
                            onClick={() =>
                              void act(archived ? unarchiveThread(ref) : archiveThread(ref))
                            }
                          >
                            {archived ? "Restore" : "Archive"}
                          </MenuItem>
                          <MenuItem
                            variant="destructive"
                            onClick={() =>
                              void act(
                                confirmAndDeleteThread(ref, { forceConfirm: true, marketer: true }),
                              )
                            }
                          >
                            Delete
                          </MenuItem>
                        </MenuPopup>
                      </Menu>
                    </>
                  )}
                </div>
              );
            })}
          </section>
        ) : null;
      })}
    </div>
  );
}

function MarketingHistoryStatus({
  thread,
}: {
  thread: ReturnType<typeof useThreadShells>[number];
}) {
  const status = marketingHistoryStatus(thread);
  return status === "Done" ? null : (
    <small className="am-history-status" data-status={status}>
      <span aria-hidden="true">●</span> {status}
    </small>
  );
}

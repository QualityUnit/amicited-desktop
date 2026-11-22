/* oxlint-disable shadcn/no-unknown-classes -- AmICited marketing styles own these classes. */
import { projectEnvironment } from "./state/projects";
import { useNavigate } from "@tanstack/react-router";
import { availableEngines } from "@amicited/cloud-client/tracking";
import { ConnectAiAppsGrid, useConnections } from "./amicited/amicitedConnections";
import { useFirstCheckChat } from "./amicited/amicitedTracking";
import { SetupTrackingPrompts } from "./amicited/SetupTrackingPrompts";
import {
  OlderWebsites,
  WorkspaceSwitcher,
  switchCommand,
  useAmicitedAccount,
} from "./amicited/amicitedAccount";
import {
  AddWebsiteButton,
  WebsiteGroup,
  WebsiteMatchContext,
  WorkspacePicker,
  useWebsiteLists,
  type WebsiteMatch,
} from "./amicited/SetupWebsitePicker";
import { effectiveMarketingAssistant } from "./marketingAssistant";
import { AmICitedLoader, AmICitedMark } from "@amicited/ui-marketing";
import { WindowDragStrip } from "./amicited/WindowDragStrip";
import { usePrimarySettings } from "./hooks/useSettings";
import { lastDomains } from "./marketingDomainStore";
import { useThreadRouteTarget } from "./hooks/useThreadRouteTarget";
import { useThreadShell } from "./state/entities";
import { useComposerDraftStore } from "./composerDraftStore";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { ChevronLeft } from "lucide-react";
import type { EnvironmentId, ModelSelection, ProjectId } from "@t3tools/contracts";
import type { CloudWebsite } from "@amicited/cloud-client/rpc";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { shouldShowSetup, setupAfterWebsite } from "@amicited/cloud-client/setup";
import { connectionAtomRuntime } from "./connection/runtime";
import { useAtomCommand } from "./state/use-atom-command";
import {
  usePrimaryEnvironmentId,
  useEnvironment,
  useEnvironmentProviders,
} from "./state/environments";
import { getOnboardingProviderState } from "./onboarding/providerReadiness.logic";
import { useDomains, NewDomainDialog } from "./marketingDomains";
import { MarketingSubscriptions } from "./marketing";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
const importDomain = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.save",
  label: "setup:import-domain",
});
const cloudSummary = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.cloudSummary",
  label: "setup:cloud-summary",
});
const listCloudPrompts = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.listCloudPrompts",
  label: "setup:cloud-prompts",
});
type WebsiteHandoff =
  | { workspaceId: string; website: CloudWebsite }
  | { workspaceId: string; matches: readonly WebsiteMatch[] };
const pendingWebsites = new Map<EnvironmentId, WebsiteHandoff>();

export const readSetup = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.setup.read",
  label: "setup:read",
});
const writeSetup = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.setup.write",
  label: "setup:write",
});
export function AssistantSetupDialog({
  open,
  onOpenChange,
  onSelected,
  destination,
}: {
  destination?: import("@t3tools/contracts").EnvironmentId | null | undefined;
  open: boolean;
  onOpenChange(value: boolean): void;
  onSelected?: (selection: ModelSelection) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Choose your assistant</DialogTitle>
          <DialogDescription>Connect the subscription you already use.</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <MarketingSubscriptions
            destination={destination}
            usageLink={false}
            {...(onSelected ? { onSelected } : {})}
          />
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
export function MarketingSetupHost({ children }: { children?: import("react").ReactNode }) {
  const { current, environmentId } = useAmicitedAccount();
  return <WorkspaceSetup key={`${environmentId}:${current?.id}`}>{children}</WorkspaceSetup>;
}
function WorkspaceSetup({ children }: { children?: import("react").ReactNode }) {
  const domains = useDomains();
  const { account, current } = useAmicitedAccount();
  const connections = useConnections();
  const createProject = useAtomCommand(projectEnvironment.createNew);
  const registerDomain = useAtomCommand(importDomain);
  const switchWorkspace = useAtomCommand(switchCommand);
  const readPrompts = useAtomCommand(listCloudPrompts);
  const [importing, setImporting] = useState(false);
  const importPending = useRef(false);
  const createdProject = useRef<{ website: string; projectId: ProjectId } | null>(null);
  const [domainReady, setDomainReady] = useState(false);
  const [addingWebsite, setAddingWebsite] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [olderCount, setOlderCount] = useState<number | null>(null);
  const [inheritedMatches, setInheritedMatches] = useState<readonly WebsiteMatch[]>([]);
  const [initialPrompts, setInitialPrompts] = useState<readonly string[]>([]);
  const [excludedEngines, setExcludedEngines] = useState<string[]>([]);
  const summaryRead = useAtomCommand(cloudSummary);
  const [summary, setSummary] = useState<{
    promptCount: number | null;
    countries: readonly string[] | null;
  } | null>(null);
  const currentWorkspaceId = current?.id;
  const environmentId = usePrimaryEnvironmentId();
  const canSwitch = useAtomValue(switchCommand.permissionAtom(environmentId));
  const canCreate = useAtomValue(projectEnvironment.createNew.permissionAtom(environmentId));
  const canRegister = useAtomValue(importDomain.permissionAtom(environmentId));
  const providers = useEnvironmentProviders();
  const settings = usePrimarySettings();
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const preferredModel =
    selectedModel ??
    effectiveMarketingAssistant(
      settings,
      environmentId ? (providers.get(environmentId) ?? []) : [],
    );
  const [selectedReady, setSelectedReady] = useState(true);
  const setupModel = preferredModel;
  const environment = useEnvironment(environmentId);
  const phase = environment?.connection.phase;
  const ready =
    selectedReady &&
    environmentId &&
    providers
      .get(environmentId)
      ?.some(
        (p) =>
          ["claudeAgent", "codex"].includes(p.driver) &&
          p.instanceId === preferredModel?.instanceId &&
          getOnboardingProviderState(p) === "ready",
      );
  const load = useAtomCommand(readSetup);
  const save = useAtomCommand(writeSetup);
  const createThread = useFirstCheckChat();
  const navigate = useNavigate();
  const [step, setStep] = useState<"assistant" | "website" | "cloud" | "apps" | "prompts" | null>(
    null,
  );
  const [finished, setFinished] = useState<boolean | null>(null);
  const [trackingOffer, setTrackingOffer] = useState(false);
  const route = useThreadRouteTarget();
  const thread = useThreadShell(route?.kind === "server" ? route.threadRef : null);
  const draft = useComposerDraftStore((s) =>
    route?.kind === "draft" ? s.getDraftSession(route.draftId) : null,
  );
  const activeProject = thread?.projectId ?? draft?.projectId;
  const [assistant, setAssistant] = useState(false);
  const [error, setError] = useState("");

  const currentWorkspaceAccess = current?.access;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Composer and Settings invoke the shared assistant/setup dialogs through shell events.
  useEffect(() => {
    const setup = () => setAssistant(true);
    const again = () => setStep("website");
    window.addEventListener("amicited-assistant-setup", setup);
    window.addEventListener("amicited-run-setup", again);
    return () => {
      window.removeEventListener("amicited-assistant-setup", setup);
      window.removeEventListener("amicited-run-setup", again);
    };
  }, []);
  const saveSetup = useEffectEvent(save);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Persist the last viewed domain in the environment so New chat survives client profile resets.
  useEffect(() => {
    if (
      !environmentId ||
      finished === null ||
      !activeProject ||
      !domains.rows.some((d) => d.projectId === activeProject)
    )
      return;
    lastDomains.set(environmentId, activeProject);
    void saveSetup({
      environmentId,
      input: { finished, trackingOffered: finished, lastDomain: activeProject },
    });
  }, [environmentId, finished, activeProject, domains.rows]);
  const [setupDomainId, setSetupDomainId] = useState<string | null>(null);
  const domain = domains.rows.find((row) => row.projectId === setupDomainId) ?? domains.rows.at(-1);
  const workspaces = current
    ? [
        current,
        ...(account?.accountWide === false
          ? []
          : (account?.workspaces ?? []).filter((workspace) => workspace.id !== current.id)),
      ]
    : [];
  const grouped = workspaces.length <= 5;
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const visibleWorkspaces = grouped ? workspaces : selectedWorkspace ? [selectedWorkspace] : [];
  const { lists, retry } = useWebsiteLists(
    environmentId,
    step === "website" && !addingWebsite && !importing
      ? visibleWorkspaces.map((workspace) => workspace.id)
      : [],
  );
  const matches = [
    ...inheritedMatches,
    ...workspaces.flatMap((workspace) => {
      if (workspace.id === currentWorkspaceId) return [];
      const result = lists.get(workspace.id);
      return result?.state === "loaded"
        ? result.websites.map((website) => ({ website, workspaceName: workspace.name }))
        : [];
    }),
  ];
  const showWorkspacePicker = !grouped && !selectedWorkspace && !addingWebsite;
  const allEmpty =
    grouped &&
    workspaces.length > 0 &&
    workspaces.every((workspace) => {
      const result = lists.get(workspace.id);
      return result?.state === "loaded" && result.websites.length === 0;
    });
  const showAddWebsite =
    current?.canCreateDomains !== false && (addingWebsite || (allEmpty && olderCount === 0));

  const importWebsite = (website: CloudWebsite) => {
    if (!environmentId || website.workspaceId !== currentWorkspaceId || importPending.current)
      return;
    importPending.current = true;
    setImporting(true);
    setError("");
    void (async () => {
      let projectId = domains.rows.find((row) => row.hostname === website.hostname)?.projectId;
      if (!projectId) {
        const savedProject = createdProject.current;
        if (savedProject?.website === website.hostname) projectId = savedProject.projectId;
        else {
          const created = await createProject({ environmentId, input: { name: website.hostname } });
          if (created._tag !== "Success") {
            setError("Could not open this website. Try again.");
            return;
          }
          projectId = created.value.projectId;
          createdProject.current = {
            website: website.hostname,
            projectId: created.value.projectId,
          };
        }
        const saved = await registerDomain({
          environmentId,
          input: {
            projectId,
            website: website.hostname,
            brand: website.brand ?? website.hostname,
            cms: "unknown",
            siteFiles: null,
            framework: null,
            expectedWorkspaceId: website.workspaceId,
            ...(website.domainId ? { domainId: website.domainId } : {}),
          },
        });
        if (saved._tag !== "Success") {
          setError("Could not import this website. Try again.");
          return;
        }
        createdProject.current = null;
        await domains.refresh();
      }
      const prompts = website.domainId
        ? await readPrompts({
            environmentId,
            input: { workspaceId: website.workspaceId, domainId: website.domainId },
          }).catch(() => undefined)
        : undefined;
      setInitialPrompts(prompts?._tag === "Success" ? prompts.value : []);
      setSetupDomainId(projectId);
      setStep(setupAfterWebsite(currentWorkspaceAccess));
    })()
      .catch(() => {
        setError("Could not import this website. Try again.");
      })
      .finally(() => {
        importPending.current = false;
        setImporting(false);
      });
  };
  const switchForWebsite = async (handoff: WebsiteHandoff) => {
    if (!environmentId || !canSwitch || importPending.current) return;
    importPending.current = true;
    setImporting(true);
    setError("");
    pendingWebsites.set(environmentId, handoff);
    const result = await switchWorkspace({
      environmentId,
      input: { workspaceId: handoff.workspaceId },
    }).catch(() => undefined);
    if (result?._tag === "Success") return;
    if (pendingWebsites.get(environmentId) === handoff) pendingWebsites.delete(environmentId);
    importPending.current = false;
    setImporting(false);
    setError("Could not switch workspaces. Please try again.");
  };
  const resumeWebsite = useEffectEvent(() => {
    if (!environmentId) return false;
    const handoff = pendingWebsites.get(environmentId);
    if (!handoff || handoff.workspaceId !== currentWorkspaceId) return false;
    pendingWebsites.delete(environmentId);
    setStep("website");
    if ("website" in handoff) importWebsite(handoff.website);
    else {
      setInheritedMatches(handoff.matches);
      setAddingWebsite(true);
    }
    return true;
  });

  const loadSetup = useEffectEvent(load);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- First-run completion is read from the environment-owned AmICited store.
  useEffect(() => {
    if (!environmentId || phase !== "connected" || !domains.loaded) return;
    let active = true;
    void loadSetup({ environmentId, input: undefined }).then((result) => {
      if (active && result._tag === "Success") {
        setFinished(result.value.finished && result.value.trackingOffered === true);
        if (result.value.finished && !result.value.trackingOffered) setTrackingOffer(true);
        if (result.value.lastDomain) lastDomains.set(environmentId, result.value.lastDomain);
        if (resumeWebsite()) return;
        if (
          shouldShowSetup(
            true,
            domains.rows.length,
            result.value.finished && result.value.trackingOffered === true,
          )
        )
          setStep(
            (current) =>
              current ??
              (domains.rows.length
                ? currentWorkspaceAccess === "full"
                  ? "cloud"
                  : "apps"
                : "website"),
          );
      }
    });
    return () => {
      active = false;
    };
  }, [environmentId, phase, domains.loaded, domains.rows.length, currentWorkspaceAccess]);

  const pickWebsite = (website: CloudWebsite) =>
    website.workspaceId === currentWorkspaceId
      ? importWebsite(website)
      : void switchForWebsite({ workspaceId: website.workspaceId, website });
  const addWebsite = (workspaceId: string) => {
    if (workspaceId === currentWorkspaceId) {
      setAddingWebsite(true);
      return;
    }
    const otherMatches = matches.filter((match) => match.website.workspaceId !== workspaceId);
    const result = currentWorkspaceId ? lists.get(currentWorkspaceId) : undefined;
    if (current && result?.state === "loaded")
      otherMatches.push(
        ...result.websites.map((website) => ({ website, workspaceName: current.name })),
      );
    void switchForWebsite({ workspaceId, matches: otherMatches });
  };
  const completeWebsite = (projectId: string) => {
    setInitialPrompts([]);
    setSetupDomainId(projectId);
    setStep(setupAfterWebsite(currentWorkspaceAccess));
  };
  const finish = async (config?: import("@amicited/cloud-client/tracking").TrackingConfig) => {
    if (!environmentId || !domain || !current || current.sessionEnded) return;
    const threadModel = setupModel ?? settings.textGenerationModelSelection;
    const threadId = config ? await createThread(domain.projectId, threadModel, config) : null;
    if (config && !threadId) {
      setError("Could not open your first check chat. Please try again.");
      return;
    }
    const result = await save({
      environmentId,
      input: {
        finished: true,
        trackingOffered: true,
        ...(domain ? { lastDomain: domain.projectId } : {}),
      },
    });
    if (result._tag !== "Success") {
      setError("Could not save setup. Please try again.");
      return;
    }
    setFinished(true);
    setStep(null);
    if (threadId)
      await navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
    else await navigate({ to: "/home" });
  };
  const loadSummary = useEffectEvent(summaryRead);
  const summaryProjectId = domain?.projectId;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Paid setup reads the selected domain's cloud measurements.
  useEffect(() => {
    if (step !== "cloud" || !environmentId || !summaryProjectId) return;
    let active = true;
    void loadSummary({ environmentId, input: { projectId: summaryProjectId } }).then((r) => {
      if (active && r._tag === "Success") setSummary(r.value);
    });
    return () => {
      active = false;
    };
  }, [step, environmentId, summaryProjectId]);
  if (finished === null && domains.rows.length === 0)
    return (
      <main data-am="am-setup-loading">
        <WindowDragStrip />
        <AmICitedLoader label="Loading your workspace…" />
      </main>
    );
  if (!step)
    return (
      <>
        {children}
        <AssistantSetupDialog open={assistant} onOpenChange={setAssistant} />
      </>
    );
  const titles = {
    assistant: "Choose your AI assistant",
    website: showAddWebsite
      ? "Add your website"
      : showWorkspacePicker
        ? "Pick a workspace"
        : "Pick a website",
    cloud: `${domain?.hostname ?? "Your website"} is already tracked`,
    apps: "Connect your AI apps",
    prompts: "Choose prompts to track",
  };
  const websitePickerSubtitle = showWorkspacePicker
    ? `You have ${workspaces.length} workspaces. Pick one to see its websites.`
    : selectedWorkspace
      ? `${selectedWorkspace.name} · ${selectedWorkspace.plan}`
      : "These websites are already in your AmICited account.";
  const back = () =>
    setStep(step === "prompts" ? "apps" : step === "apps" ? "assistant" : "website");
  const engines = availableEngines(connections.snapshot.connections).filter(
    (engine) => !excludedEngines.includes(engine),
  );
  return (
    <main data-am="am-setup" data-onboarding-surface="" aria-label="AmICited setup">
      <WindowDragStrip />
      <div data-am="am-setup-column">
        <div data-am="am-setup-brand">
          <AmICitedMark />
          <WorkspaceSwitcher compact />
        </div>
        <nav aria-label="Setup progress" data-am="am-setup-progress">
          <span>✓ Account</span>
          {(["website", "assistant", "apps", "prompts"] as const).map((item, i) => (
            <span key={item} aria-current={step === item ? "step" : undefined}>
              {["website", "assistant", "apps", "prompts"].indexOf(step) > i ? "✓ " : ""}
              {["Website", "Assistant", "AI apps", "Prompts"][i]}
            </span>
          ))}
        </nav>
        {step !== "assistant" && (
          <header>
            {step === "website" && !showAddWebsite && selectedWorkspace && (
              <Button
                type="button"
                variant="link"
                onClick={() => setSelectedWorkspaceId(null)}
                disabled={importing}
              >
                <ChevronLeft aria-hidden="true" /> Workspaces
              </Button>
            )}
            <h1>{titles[step]}</h1>
            <p className="text-sm text-muted-foreground" hidden={step === "prompts"}>
              {step === "website"
                ? !showAddWebsite
                  ? websitePickerSubtitle
                  : "We'll use this to check how AI talks about your brand."
                : step === "cloud"
                  ? "Your plan tracks prompts every day in the cloud. You can also check up to 20 a day on this computer later, from Prompts."
                  : step === "prompts"
                    ? "Start with 10 suggested questions, edit them or add your own."
                    : "AmICited asks them your prompts in your own browser, signed in as you. Sign in once to each."}
            </p>
          </header>
        )}
        <div data-am="am-setup-body">
          {step === "assistant" && (
            <MarketingSubscriptions
              usageLink={false}
              showIntro={false}
              onSelected={setSelectedModel}
              onReadyChange={setSelectedReady}
            />
          )}
          {step === "assistant" && (
            <p className="am-muted">
              Your assistant writes your first tracking prompts from your website, then explains the
              results and helps make the fixes.
            </p>
          )}
          {step === "website" && current && (
            <div className="am-website-picker-body">
              {showWorkspacePicker && (
                <WorkspacePicker
                  workspaces={workspaces}
                  currentId={current.id}
                  onSelect={setSelectedWorkspaceId}
                  disabled={importing}
                />
              )}
              {!showAddWebsite &&
                visibleWorkspaces.map((workspace) => (
                  <WebsiteGroup
                    key={workspace.id}
                    workspace={workspace}
                    result={lists.get(workspace.id)}
                    current={workspace.id === current.id}
                    grouped={grouped}
                    busy={importing}
                    pickDisabled={
                      importing ||
                      !canCreate ||
                      !canRegister ||
                      (workspace.id !== current.id && !canSwitch)
                    }
                    onPick={pickWebsite}
                    onRetry={() => void retry(workspace.id)}
                  />
                ))}
              {grouped && (
                <div hidden={showAddWebsite || olderCount === 0}>
                  <OlderWebsites onCount={setOlderCount} onComplete={completeWebsite} />
                </div>
              )}
              {showAddWebsite ? (
                <WebsiteMatchContext.Provider
                  value={{
                    matches,
                    onPick: pickWebsite,
                    disabled: importing || !canSwitch || !canCreate || !canRegister,
                  }}
                >
                  <NewDomainDialog
                    open
                    inline
                    onOpenChange={() => {}}
                    onReadyChange={setDomainReady}
                    onCreated={completeWebsite}
                  />
                </WebsiteMatchContext.Provider>
              ) : (
                !showWorkspacePicker &&
                (selectedWorkspace ?? current).canCreateDomains !== false && (
                  <AddWebsiteButton
                    disabled={
                      importing ||
                      !canCreate ||
                      !canRegister ||
                      Boolean(
                        selectedWorkspace && selectedWorkspace.id !== current.id && !canSwitch,
                      )
                    }
                    onClick={() => addWebsite((selectedWorkspace ?? current).id)}
                  />
                )
              )}
              {showAddWebsite && domains.rows.length > 0 && (
                <section>
                  <h2>Pick a website</h2>
                  {domains.rows.map((row) => (
                    <Button
                      key={`${current.id}:${row.hostname}`}
                      variant="outline"
                      onClick={() => completeWebsite(row.projectId)}
                    >
                      {row.hostname}
                    </Button>
                  ))}
                </section>
              )}
            </div>
          )}
          {step === "cloud" && (
            <section data-am="am-setup-cloud">
              <ul>
                {summary?.promptCount != null || initialPrompts.length > 0 ? (
                  <li>
                    {summary?.promptCount ?? initialPrompts.length} prompts, checked every day in
                    the cloud
                  </li>
                ) : null}
                {summary?.countries?.length ? (
                  <li>
                    {summary.countries.length} countries: {summary.countries.join(", ")}
                  </li>
                ) : null}
                <li>
                  Your {current?.plan} plan does the tracking. There is nothing to set up on this
                  computer and no AI apps to sign in to.
                </li>
              </ul>
              <p>Your assistant starts from today’s results.</p>
              <p>
                <a href="https://app.flowhunt.io/amicited" target="_blank" rel="noreferrer">
                  Manage prompts in AmICited
                </a>
              </p>
            </section>
          )}
          {step === "apps" && (
            <ConnectAiAppsGrid
              excluded={excludedEngines}
              onToggle={(engine) =>
                setExcludedEngines((rows) =>
                  rows.includes(engine) ? rows.filter((row) => row !== engine) : [...rows, engine],
                )
              }
            />
          )}
          {step === "prompts" && domain && environmentId && (
            <SetupTrackingPrompts
              key={domain.projectId}
              domain={domain}
              destination={environmentId}
              engines={engines}
              initialPrompts={initialPrompts}
              onBack={back}
              onComplete={finish}
            />
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        {step !== "prompts" && (
          <footer data-am="am-setup-footer">
            <Button variant="ghost" disabled={step === "website"} onClick={back}>
              Back
            </Button>
            <div className="flex items-center gap-2">
              {step === "apps" && (
                <span className="text-sm text-muted-foreground">
                  {engines.length} of 6 connected
                </span>
              )}
              {step === "apps" && trackingOffer && (
                <Button variant="ghost" onClick={() => void finish()}>
                  Set up tracking later
                </Button>
              )}
              {step === "assistant" && (
                <Button
                  variant="ghost"
                  onClick={() => (current?.access === "full" ? void finish() : setStep("apps"))}
                >
                  Set up later
                </Button>
              )}
              {step === "website" && showAddWebsite ? (
                <Button
                  type="submit"
                  form="amicited-onboarding-domain"
                  disabled={!domainReady || importing}
                >
                  Continue
                </Button>
              ) : step === "website" ? null : (
                <Button
                  disabled={
                    (step === "assistant" && (!ready || !setupModel)) ||
                    (step === "apps" && engines.length === 0)
                  }
                  onClick={() =>
                    step === "cloud"
                      ? setStep("assistant")
                      : step === "assistant"
                        ? current?.access === "full"
                          ? void finish()
                          : setStep("apps")
                        : setStep("prompts")
                  }
                >
                  Continue
                </Button>
              )}
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}

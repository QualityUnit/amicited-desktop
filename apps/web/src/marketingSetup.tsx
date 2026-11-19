/* oxlint-disable shadcn/no-unknown-classes -- AmICited marketing styles own these classes. */
import { projectEnvironment } from "./state/projects";
import { useNavigate } from "@tanstack/react-router";
import { availableEngines } from "@amicited/cloud-client/tracking";
import { ConnectAiAppsGrid, useConnections } from "./amicited/amicitedConnections";
import { useFirstCheckChat } from "./amicited/amicitedTracking";
import { SetupTrackingPrompts } from "./amicited/SetupTrackingPrompts";
import { OlderWebsites, WorkspaceSwitcher, useAmicitedAccount } from "./amicited/amicitedAccount";
import { effectiveMarketingAssistant } from "./marketingAssistant";
import { AmICitedLoader, AmICitedMark } from "@amicited/ui-marketing";
import { WindowDragStrip } from "./amicited/WindowDragStrip";
import { usePrimarySettings } from "./hooks/useSettings";
import { lastDomains } from "./marketingDomainStore";
import { useThreadRouteTarget } from "./hooks/useThreadRouteTarget";
import { useThreadShell } from "./state/entities";
import { useComposerDraftStore } from "./composerDraftStore";
import { useEffect, useEffectEvent, useState } from "react";
import type { ModelSelection } from "@t3tools/contracts";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import {
  shouldShowSetup,
  setupAfterWebsite,
  cloudSetupWebsites,
} from "@amicited/cloud-client/setup";
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
const listCloud = createEnvironmentRpcCommand(connectionAtomRuntime, {
  tag: "amicited.domains.listCloud",
  label: "setup:cloud-websites",
});
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
  const { current } = useAmicitedAccount();
  return <WorkspaceSetup key={current?.id ?? "no-workspace"}>{children}</WorkspaceSetup>;
}
function WorkspaceSetup({ children }: { children?: import("react").ReactNode }) {
  const domains = useDomains();
  const { current } = useAmicitedAccount();
  const connections = useConnections();
  const readCloud = useAtomCommand(listCloud);
  const createProject = useAtomCommand(projectEnvironment.createNew);
  const registerDomain = useAtomCommand(importDomain);
  const [importing, setImporting] = useState(false);
  const loadCloudWebsites = useEffectEvent(readCloud);
  const [cloudRows, setCloudRows] = useState<ReturnType<typeof cloudSetupWebsites>>([]);
  const [domainReady, setDomainReady] = useState(false);
  const [cloudWebsite, setCloudWebsite] = useState("");
  const [addingWebsite, setAddingWebsite] = useState(false);
  const [olderCount, setOlderCount] = useState(0);
  const [excludedEngines, setExcludedEngines] = useState<string[]>([]);
  const summaryRead = useAtomCommand(cloudSummary);
  const [summary, setSummary] = useState<{
    promptCount: number | null;
    countries: readonly string[] | null;
  } | null>(null);
  const currentWorkspaceId = current?.id;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Read the workspace's cloud websites when the account changes.
  useEffect(() => {
    if (!currentWorkspaceId || !domains.environmentId) return;
    let active = true;
    void loadCloudWebsites({ environmentId: domains.environmentId, input: undefined }).then((r) => {
      if (active && r._tag === "Success") setCloudRows(cloudSetupWebsites(r.value));
    });
    return () => {
      active = false;
    };
  }, [currentWorkspaceId, domains.environmentId]);
  const environmentId = usePrimaryEnvironmentId();
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
    website: olderCount
      ? `We found ${olderCount} websites on this computer`
      : cloudRows.length && !addingWebsite
        ? "Pick a website"
        : "Add your website",
    cloud: `${domain?.hostname ?? "Your website"} is already tracked`,
    apps: "Connect your AI apps",
    prompts: "Choose prompts to track",
  };
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
            <h1>{titles[step]}</h1>
            <p className="text-sm text-muted-foreground" hidden={step === "prompts"}>
              {step === "website"
                ? olderCount
                  ? "You set these up before accounts existed. Add them to AmICited to keep using them."
                  : "Keep your chats, brand and site files together in a domain."
                : step === "cloud"
                  ? "Your plan tracks prompts every day in the cloud. You can also check up to 20 a day on this computer later, from Prompts."
                  : step === "prompts"
                    ? "Start with 10 suggested questions, edit them or add your own."
                    : "AmICited asks them your prompts in your own browser, signed in as you. Sign in once to each."}
            </p>
          </header>
        )}
        <div data-am="am-setup-body">
          {step === "website" && (
            <OlderWebsites
              onCount={setOlderCount}
              onComplete={(projectId) => {
                setSetupDomainId(projectId);
                setStep(setupAfterWebsite(current?.access));
              }}
            />
          )}
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
          {step === "website" && !olderCount && (!cloudRows.length || addingWebsite) && (
            <NewDomainDialog
              key={cloudWebsite}
              initialWebsite={cloudWebsite}
              cloudDomain={cloudRows.find((row) => row.hostname === cloudWebsite)}
              open
              inline
              onOpenChange={() => {}}
              onReadyChange={setDomainReady}
              onCreated={(projectId) => {
                setSetupDomainId(projectId);
                setStep(setupAfterWebsite(current?.access));
              }}
            />
          )}
          {step === "website" && !olderCount && cloudRows.length > 0 && !addingWebsite && (
            <section className="am-picker">
              <p>
                These websites are already in {current?.name}. Pick one to work on here, or add
                another.
              </p>
              {cloudRows.map((row) => (
                <Button
                  key={row.hostname}
                  disabled={importing}
                  variant="outline"
                  onClick={() => {
                    const existing = domains.rows.find((d) => d.hostname === row.hostname);
                    if (existing) {
                      setSetupDomainId(existing.projectId);
                      setCloudWebsite(row.hostname);
                      setStep(setupAfterWebsite(current?.access));
                    } else if (domains.environmentId && !importing) {
                      const destination = domains.environmentId;
                      setImporting(true);
                      void (async () => {
                        try {
                          const created = await createProject({
                            environmentId: destination,
                            input: { name: row.hostname },
                          });
                          if (created._tag !== "Success") {
                            setError("Could not open this website. Try again.");
                            return;
                          }
                          const saved = await registerDomain({
                            environmentId: destination,
                            input: {
                              projectId: created.value.projectId,
                              website: row.hostname,
                              brand: row.brand ?? row.hostname,
                              cms: "unknown",
                              siteFiles: null,
                              framework: null,
                              ...(row.domainId ? { domainId: row.domainId } : {}),
                            },
                          });
                          if (saved._tag !== "Success") {
                            setError("Could not import this website. Try again.");
                            return;
                          }
                          await domains.refresh();
                          setSetupDomainId(created.value.projectId);
                          setStep(setupAfterWebsite(current?.access));
                        } catch {
                          setError("Could not import this website. Try again.");
                        }
                      })().finally(() => setImporting(false));
                    }
                  }}
                >
                  <span className="am-brand-avatar">
                    {(row.brand ?? row.hostname)[0]?.toUpperCase()}
                  </span>
                  <span>
                    <strong>{row.brand ?? row.hostname}</strong>
                    <small>
                      {row.hostname} ·{" "}
                      {row.prompts.length ? `${row.prompts.length} prompts` : "In AmICited"}
                    </small>
                  </span>
                  <span>{current?.plan}</span>
                </Button>
              ))}
              <Button
                variant="ghost"
                onClick={() => {
                  setCloudWebsite("");
                  setAddingWebsite(true);
                }}
              >
                ＋ Add a new website
              </Button>
            </section>
          )}
          {step === "website" && !olderCount && !cloudRows.length && domains.rows.length > 0 && (
            <section>
              <h2>Pick a website</h2>
              {domains.rows.map((row) => (
                <Button
                  key={row.projectId}
                  variant="outline"
                  onClick={() => {
                    setSetupDomainId(row.projectId);
                    setStep(setupAfterWebsite(current?.access));
                  }}
                >
                  {row.hostname}
                </Button>
              ))}
              <p>Or add a new website above.</p>
            </section>
          )}
          {step === "cloud" && (
            <section data-am="am-setup-cloud">
              <ul>
                {summary?.promptCount != null && (
                  <li>{summary.promptCount} prompts, checked every day in the cloud</li>
                )}
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
              initialPrompts={
                cloudRows.find((row) => row.hostname === domain.hostname)?.prompts ?? []
              }
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
              {step === "website" && (olderCount > 0 || !cloudRows.length || addingWebsite) ? (
                <Button
                  type="submit"
                  form="amicited-onboarding-domain"
                  disabled={!olderCount && !domainReady}
                >
                  {olderCount ? "Add websites and continue" : "Continue"}
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

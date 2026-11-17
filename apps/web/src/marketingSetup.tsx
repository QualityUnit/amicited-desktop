import { useNavigate } from "@tanstack/react-router";
import { ConnectAiAppsGrid, useConnections } from "./rpc/amicitedConnections";
import { SetupTrackingPrompts, useFirstCheckChat } from "./rpc/amicitedTracking";
import { OlderWebsites, WorkspaceSwitcher, useAmicitedAccount } from "./rpc/amicitedAccount";
import { effectiveMarketingAssistant } from "./marketingAssistant";
import { AmICitedMark } from "@amicited/ui-marketing";
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
  const domains = useDomains();
  const { current } = useAmicitedAccount();
  const connections = useConnections();
  const readCloud = useAtomCommand(listCloud);
  const loadCloudWebsites = useEffectEvent(readCloud);
  const [cloudRows, setCloudRows] = useState<ReturnType<typeof cloudSetupWebsites>>([]);
  const [cloudWebsite, setCloudWebsite] = useState("");
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
    const threadId = await createThread(domain.projectId, threadModel, config);
    if (!threadId) {
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
    await navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
  };
  if (finished === null && domains.rows.length === 0)
    return <main data-am="am-setup-loading">Loading your workspace…</main>;
  if (!step)
    return (
      <>
        {children}
        <AssistantSetupDialog open={assistant} onOpenChange={setAssistant} />
      </>
    );
  const titles = {
    assistant: "Choose your AI assistant",
    website: "Add your website",
    cloud: `${domain?.hostname ?? "Your website"} is already tracked`,
    apps: "Connect your AI apps",
    prompts: "Choose prompts to track",
  };
  const back = () =>
    setStep(step === "prompts" ? "apps" : step === "apps" ? "assistant" : "website");
  const engines = connections.snapshot.connections.flatMap((c) =>
    c.status !== "connected" ||
    !["chatgpt", "perplexity", "gemini", "claude", "google"].includes(c.id)
      ? []
      : c.id === "google"
        ? (["google", "google_overviews"] as const)
        : c.id === "chatgpt" || c.id === "perplexity" || c.id === "gemini" || c.id === "claude"
          ? [c.id]
          : [],
  );
  return (
    <main data-am="am-setup" data-onboarding-surface="" aria-label="AmICited setup">
      <div data-am="am-setup-column">
        <div data-am="am-setup-brand">
          <AmICitedMark />
          <WorkspaceSwitcher compact />
        </div>
        <nav aria-label="Setup progress" data-am="am-setup-progress">
          {(["website", "assistant", "apps", "prompts"] as const).map((item, i) => (
            <span key={item} aria-current={step === item ? "step" : undefined}>
              {["website", "assistant", "apps", "prompts"].indexOf(step) > i ? "✓ " : ""}
              {i === 0 ? "✓ Account · " : ""}
              {["Website", "Assistant", "AI apps", "Prompts"][i]}
            </span>
          ))}
        </nav>
        {step !== "assistant" && (
          <header>
            <h1>{titles[step]}</h1>
            <p className="text-sm text-muted-foreground">
              {step === "website"
                ? "Keep your chats, brand and site files together in a domain."
                : step === "cloud"
                  ? "Your plan tracks prompts every day in the cloud. There are no AI apps to sign in to on this computer."
                  : step === "prompts"
                    ? "Start with 10 suggested questions, edit them or add your own."
                    : "Uses the accounts you already have."}
            </p>
          </header>
        )}
        <div data-am="am-setup-body">
          {step === "website" && <OlderWebsites />}
          {step === "assistant" && (
            <MarketingSubscriptions
              usageLink={false}
              showIntro={false}
              onSelected={setSelectedModel}
              onReadyChange={setSelectedReady}
            />
          )}
          {step === "website" && (
            <NewDomainDialog
              key={cloudWebsite}
              initialWebsite={cloudWebsite}
              open
              inline
              onOpenChange={() => {}}
              onCreated={(projectId) => {
                setSetupDomainId(projectId);
                setStep(setupAfterWebsite(current?.access));
              }}
            />
          )}
          {step === "website" && cloudRows.length > 0 && (
            <section>
              <h2>Websites in {current?.name}</h2>
              {cloudRows.map((row) => (
                <Button
                  key={row.hostname}
                  variant="outline"
                  onClick={() => {
                    const existing = domains.rows.find((d) => d.hostname === row.hostname);
                    if (existing) {
                      setSetupDomainId(existing.projectId);
                      setCloudWebsite(row.hostname);
                      setStep(setupAfterWebsite(current?.access));
                    } else setCloudWebsite(row.hostname);
                  }}
                >
                  {row.hostname}
                </Button>
              ))}
            </section>
          )}
          {step === "website" && domains.rows.length > 0 && (
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
            <p>
              <a href="https://app.flowhunt.io/amicited" target="_blank" rel="noreferrer">
                Manage prompts in AmICited
              </a>
            </p>
          )}
          {step === "apps" && <ConnectAiAppsGrid />}
          {step === "prompts" && domain && environmentId && (
            <SetupTrackingPrompts
              key={domain.projectId}
              domain={domain}
              destination={environmentId}
              engines={engines}
              initialPrompts={
                cloudRows.find((row) => row.hostname === domain.hostname)?.prompts ?? []
              }
              onComplete={finish}
            />
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        <footer data-am="am-setup-footer">
          <Button variant="ghost" disabled={step === "website"} onClick={back}>
            Back
          </Button>
          <div className="flex gap-2">
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
            {step === "website" ? (
              <Button type="submit" form="amicited-onboarding-domain">
                Continue
              </Button>
            ) : step === "prompts" ? null : (
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
      </div>
    </main>
  );
}

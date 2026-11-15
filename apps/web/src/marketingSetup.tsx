import { AmICitedMark } from "@amicited/ui-marketing";
import { usePrimarySettings } from "./hooks/useSettings";
import { lastDomains } from "./marketingDomainStore";
import { useThreadRouteTarget } from "./hooks/useThreadRouteTarget";
import { useThreadShell } from "./state/entities";
import { useComposerDraftStore } from "./composerDraftStore";
import { useEffect, useEffectEvent, useState } from "react";
import type { ModelSelection } from "@t3tools/contracts";
import { ProjectId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { createEnvironmentRpcCommand } from "@t3tools/client-runtime/state/runtime";
import { shouldShowSetup } from "@amicited/cloud-client/setup";
import { connectionAtomRuntime } from "./connection/runtime";
import { useAtomCommand } from "./state/use-atom-command";
import {
  usePrimaryEnvironmentId,
  useEnvironment,
  useEnvironmentProviders,
} from "./state/environments";
import { getOnboardingProviderState } from "./onboarding/providerReadiness.logic";
import { useNewThreadHandler } from "./hooks/useHandleNewThread";
import { useDomains, NewDomainDialog, DomainConnection } from "./marketingDomains";
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
        <DialogHeader>
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
  const environmentId = usePrimaryEnvironmentId();
  const providers = useEnvironmentProviders();
  const settings = usePrimarySettings();
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const preferredModel = selectedModel ?? settings.textGenerationModelSelection;
  const setupModel = preferredModel;
  const environment = useEnvironment(environmentId);
  const phase = environment?.connection.phase;
  const ready =
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
  const newThread = useNewThreadHandler();
  const [step, setStep] = useState<"welcome" | "assistant" | "website" | "cloud" | null>(null);
  const [finished, setFinished] = useState<boolean | null>(null);
  const route = useThreadRouteTarget();
  const thread = useThreadShell(route?.kind === "server" ? route.threadRef : null);
  const draft = useComposerDraftStore((s) =>
    route?.kind === "draft" ? s.getDraftSession(route.draftId) : null,
  );
  const activeProject = thread?.projectId ?? draft?.projectId;
  const [assistant, setAssistant] = useState(false);
  const [error, setError] = useState("");

  const loadSetup = useEffectEvent(load);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- First-run completion is read from the environment-owned AmICited store.
  useEffect(() => {
    if (!environmentId || phase !== "connected" || !domains.loaded) return;
    let active = true;
    void loadSetup({ environmentId, input: undefined }).then((result) => {
      if (active && result._tag === "Success") {
        setFinished(result.value.finished);
        if (result.value.lastDomain) lastDomains.set(environmentId, result.value.lastDomain);
        if (shouldShowSetup(true, domains.rows.length, result.value.finished))
          setStep((current) => current ?? "welcome");
      }
    });
    return () => {
      active = false;
    };
  }, [environmentId, phase, domains.loaded, domains.rows.length]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Composer and Settings invoke the shared assistant/setup dialogs through shell events.
  useEffect(() => {
    const setup = () => setAssistant(true);
    const again = () => setStep("welcome");
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
    void saveSetup({ environmentId, input: { finished, lastDomain: activeProject } });
  }, [environmentId, finished, activeProject, domains.rows]);
  const [setupDomainId, setSetupDomainId] = useState<string | null>(null);
  const domain = domains.rows.find((row) => row.projectId === setupDomainId) ?? domains.rows.at(-1);
  const finish = async () => {
    if (!environmentId) return;
    const result = await save({
      environmentId,
      input: { finished: true, ...(domain ? { lastDomain: domain.projectId } : {}) },
    });
    if (result._tag !== "Success") {
      setError("Could not save setup. Please try again.");
      return;
    }
    setFinished(true);
    setStep(null);
    if (domain)
      await newThread(
        scopeProjectRef(environmentId, ProjectId.make(domain.projectId)),
        setupModel ? { modelSelection: setupModel } : undefined,
      );
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
    welcome: "Welcome to AmICited",
    assistant: "Choose your AI assistant",
    website: "Add your website",
    cloud: "Connect AmICited (free)",
  };
  const back = () =>
    setStep(step === "assistant" ? "welcome" : step === "website" ? "assistant" : "website");
  return (
    <main data-am="am-setup" data-onboarding-surface="" aria-label="AmICited setup">
      <div data-am="am-setup-column">
        <div data-am="am-setup-brand">
          <AmICitedMark />
        </div>
        <nav aria-label="Setup progress" data-am="am-setup-progress">
          {(["assistant", "website", "cloud"] as const).map((item, i) => (
            <span key={item} aria-current={step === item ? "step" : undefined}>
              {["welcome", "assistant", "website", "cloud"].indexOf(step) > i + 1 ? "✓ " : ""}
              {["Assistant", "Website", "AmICited"][i]}
            </span>
          ))}
        </nav>
        <header>
          <h1>{titles[step]}</h1>
          <p className="text-sm text-muted-foreground">
            {step === "welcome"
              ? "Your AI workspace for marketing. From a question to a useful next step."
              : step === "website"
                ? "Keep your chats, brand and site files together in a domain."
                : step === "cloud"
                  ? "Your local tools always work without an account."
                  : "Uses your existing Claude or ChatGPT subscription. No API key; your login stays on this computer."}
          </p>
        </header>
        <div data-am="am-setup-body">
          {step === "assistant" && (
            <MarketingSubscriptions
              usageLink={false}
              showIntro={false}
              onSelected={setSelectedModel}
            />
          )}
          {step === "website" && (
            <NewDomainDialog
              open
              inline
              onOpenChange={() => {}}
              onCreated={(projectId) => {
                setSetupDomainId(projectId);
                setStep("cloud");
              }}
            />
          )}
          {step === "cloud" && (
            <div data-am="am-setup-cloud">
              <ul>
                <li>Check how AI assistants mention your brand</li>
                <li>Find website and content opportunities</li>
                <li>Keep your marketing checks together</li>
              </ul>
              <p>
                Free tools use workspace credits; welcome credits cover your first checks. Optional
                7-day trial (card required), then Pro €120/month.
              </p>
              {domain && environmentId ? (
                <DomainConnection domain={domain} destination={environmentId} onboarding />
              ) : (
                <p>Add a website to connect AmICited. You can do this later in Settings.</p>
              )}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        <footer data-am="am-setup-footer">
          <Button variant="ghost" disabled={step === "welcome"} onClick={back}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() =>
                step === "assistant"
                  ? setStep("website")
                  : step === "website"
                    ? setStep("cloud")
                    : void finish()
              }
            >
              {step === "assistant" ? "Set up later" : "Skip"}
            </Button>
            {step === "website" ? (
              <Button type="submit" form="amicited-onboarding-domain">
                Continue
              </Button>
            ) : (
              <Button
                disabled={step === "assistant" && (!ready || !setupModel)}
                onClick={() =>
                  step === "welcome"
                    ? setStep("assistant")
                    : step === "assistant"
                      ? setStep("website")
                      : void finish()
                }
              >
                {step === "welcome"
                  ? "Get started"
                  : step === "cloud"
                    ? "Start chatting"
                    : "Continue"}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </main>
  );
}

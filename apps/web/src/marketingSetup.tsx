import { usePrimarySettings } from "./hooks/useSettings";
import { resolveAppModelSelectionState } from "./modelSelection";
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
export function MarketingSetupHost() {
  const domains = useDomains();
  const environmentId = usePrimaryEnvironmentId();
  const providers = useEnvironmentProviders();
  const settings = usePrimarySettings();
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const preferredModel = selectedModel ?? settings.textGenerationModelSelection;
  const readyProviders = environmentId
    ? (providers.get(environmentId) ?? []).filter(
        (p) =>
          ["claudeAgent", "codex"].includes(p.driver) && getOnboardingProviderState(p) === "ready",
      )
    : [];
  const setupModel =
    readyProviders.length === 0 ||
    readyProviders.some((p) => p.instanceId === preferredModel?.instanceId)
      ? preferredModel
      : resolveAppModelSelectionState(settings, readyProviders.slice(0, 1));
  const environment = useEnvironment(environmentId);
  const phase = environment?.connection.phase;
  const ready =
    environmentId &&
    providers
      .get(environmentId)
      ?.some(
        (p) =>
          ["claudeAgent", "codex"].includes(p.driver) && getOnboardingProviderState(p) === "ready",
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
  const [websiteOpen, setWebsiteOpen] = useState(false);
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
  const domain = domains.rows.at(-1);
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
  return (
    <>
      <AssistantSetupDialog open={assistant} onOpenChange={setAssistant} />
      <NewDomainDialog
        open={websiteOpen}
        onOpenChange={setWebsiteOpen}
        onCreated={() => {
          setWebsiteOpen(false);
          setStep("cloud");
        }}
      />
      <Dialog
        open={step !== null && !websiteOpen}
        onOpenChange={(open) => {
          if (!open) void finish();
        }}
      >
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {step === "welcome"
                ? "Welcome to AmICited"
                : step === "assistant"
                  ? "Choose your assistant"
                  : step === "website"
                    ? "Add your website"
                    : "Connect AmICited (free)"}
            </DialogTitle>
            <DialogDescription>
              {step === "welcome"
                ? "Your AI workspace for marketing. From a question to a useful next step."
                : step === "assistant"
                  ? "First, connect the assistant that will answer your questions."
                  : step === "website"
                    ? "Keep your chats, brand and site files together in a domain."
                    : "Free tools use workspace credits; welcome credits cover your first checks. A 7-day trial (card required) and Pro at €120/month are optional."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-4">
              {step === "assistant" && (
                <MarketingSubscriptions usageLink={false} onSelected={setSelectedModel} />
              )}
              {step === "cloud" && domain && environmentId && (
                <DomainConnection domain={domain} destination={environmentId} />
              )}
              {error && <p role="alert">{error}</p>}
              <div className="flex flex-wrap gap-2">
                {step !== "welcome" && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setStep(
                        step === "assistant"
                          ? "welcome"
                          : step === "website"
                            ? "assistant"
                            : "website",
                      )
                    }
                  >
                    Back
                  </Button>
                )}
                {step === "welcome" && (
                  <Button onClick={() => setStep("assistant")}>Get started</Button>
                )}
                {step === "assistant" && (
                  <Button disabled={!ready} onClick={() => setStep("website")}>
                    Continue
                  </Button>
                )}
                {step === "website" && (
                  <Button onClick={() => setWebsiteOpen(true)}>Add website</Button>
                )}
                {step === "cloud" && <Button onClick={() => void finish()}>Start chatting</Button>}
                <Button
                  variant="ghost"
                  onClick={() => (step === "assistant" ? setStep("website") : void finish())}
                >
                  {step === "assistant" ? "Set up later (chats need an assistant)" : "Skip for now"}
                </Button>
              </div>
            </div>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}

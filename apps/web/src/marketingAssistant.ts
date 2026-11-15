import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import type { UnifiedSettings } from "@t3tools/contracts/settings";
import { getDefaultServerModel } from "./providerModels";
import { getOnboardingProviderState } from "./onboarding/providerReadiness.logic";

export function recommendedMarketingAssistant(provider: ServerProvider): ModelSelection {
  const model =
    provider.driver === "claudeAgent"
      ? "claude-opus-5-5"
      : (provider.models.find((model) => model.slug === "gpt-6.1-sol")?.slug ??
        provider.models.find((model) => model.isDefault && !model.isCustom)?.slug ??
        provider.models.find((model) => !model.isCustom)?.slug ??
        provider.models[0]?.slug ??
        getDefaultServerModel([provider], provider.driver));
  const id = provider.driver === "claudeAgent" ? "effort" : "reasoningEffort";
  const descriptor = provider.models
    .find((candidate) => candidate.slug === model)
    ?.capabilities?.optionDescriptors?.find((option) => option.id === id);
  const medium =
    provider.driver === "claudeAgent" ||
    model === "gpt-6.1-sol" ||
    (descriptor?.type === "select" && descriptor.options.some((option) => option.id === "medium"));
  return {
    instanceId: provider.instanceId,
    model,
    ...(medium ? { options: [{ id, value: "medium" }] } : {}),
  };
}

export function effectiveMarketingAssistant(
  settings: Pick<UnifiedSettings, "defaultModelSelection" | "textGenerationModelSelection">,
  providers: ReadonlyArray<ServerProvider>,
): ModelSelection | null {
  const ready = providers.filter(
    (provider) =>
      (provider.driver === "claudeAgent" || provider.driver === "codex") &&
      getOnboardingProviderState(provider) === "ready",
  );
  const stored = settings.defaultModelSelection;
  if (
    stored &&
    providers.some(
      (provider) =>
        provider.instanceId === stored.instanceId &&
        getOnboardingProviderState(provider) === "ready",
    )
  )
    return stored;
  const legacy = settings.textGenerationModelSelection;
  // The schema supplies this background default even when no assistant was ever chosen.
  const background = DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection;
  if (
    !stored &&
    legacy &&
    JSON.stringify(legacy) !== JSON.stringify(background) &&
    ready.some((provider) => provider.instanceId === legacy.instanceId)
  )
    return legacy;
  const provider = ready.find((provider) => provider.driver === "claudeAgent") ?? ready[0];
  return provider ? recommendedMarketingAssistant(provider) : null;
}

import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ProjectId,
  type ServerProvider,
} from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { resolveNewThreadModelSelectionOverride } from "./lib/chatThreadActions";
import { effectiveMarketingAssistant, recommendedMarketingAssistant } from "./marketingAssistant";

function provider(driver: "claudeAgent" | "codex", slugs: string[]): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(driver),
    driver: ProviderDriverKind.make(driver),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-01-01T00:00:00.000Z",
    slashCommands: [],
    skills: [],
    models: slugs.map((slug, index) => ({
      slug,
      name: slug,
      isCustom: false,
      isDefault: index === 0,
      capabilities: {
        optionDescriptors: [
          {
            id: driver === "codex" ? "reasoningEffort" : "effort",
            label: "Effort",
            type: "select",
            options: [
              { id: "low", label: "Low" },
              { id: "medium", label: "Medium" },
            ],
          },
        ],
      },
    })),
  };
}

describe("marketing assistant defaults", () => {
  it("recommends Opus and live Sol at medium effort, with a capability-aware Codex fallback", () => {
    expect(recommendedMarketingAssistant(provider("claudeAgent", ["claude-opus-5-5"]))).toEqual({
      instanceId: "claudeAgent",
      model: "claude-opus-5-5",
      options: [{ id: "effort", value: "medium" }],
    });
    expect(recommendedMarketingAssistant(provider("codex", ["normal", "gpt-6.1-sol"]))).toEqual({
      instanceId: "codex",
      model: "gpt-6.1-sol",
      options: [{ id: "reasoningEffort", value: "medium" }],
    });
    const fallback = provider("codex", ["normal"]);
    expect(recommendedMarketingAssistant(fallback)).toEqual({
      instanceId: "codex",
      model: "normal",
      options: [{ id: "reasoningEffort", value: "medium" }],
    });
    expect(
      recommendedMarketingAssistant({
        ...fallback,
        models: fallback.models.map((model) => ({ ...model, capabilities: {} })),
      }),
    ).toEqual({ instanceId: "codex", model: "normal" });
  });

  it("uses domain over global over recommended and never carries another domain's model", () => {
    const providers = [
      provider("codex", ["gpt-6.1-sol"]),
      provider("claudeAgent", ["claude-opus-5-5"]),
    ];
    const recommended = recommendedMarketingAssistant(providers[1]!);
    const global = recommendedMarketingAssistant(providers[0]!);
    const domain = { ...recommended, options: [{ id: "effort", value: "high" }] };
    const projectId = ProjectId.make("domain-b");
    const settings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      defaultModelSelection: global,
      projectSettingsOverrides: { [projectId]: { defaultModelSelection: domain } },
    };
    expect(effectiveMarketingAssistant(DEFAULT_UNIFIED_SETTINGS, providers)).toEqual(recommended);
    expect(effectiveMarketingAssistant(settings, providers)).toEqual(global);
    const resolved = resolveProjectSettings(settings, projectId).settings;
    const selected = effectiveMarketingAssistant(resolved, providers);
    expect(selected).toEqual(domain);
    expect(
      resolveNewThreadModelSelectionOverride({
        projectDefaultSelection: selected,
        carrySelection: global,
        carrySourceDraftId: "domain-a-draft",
        destinationDraftId: "domain-b-draft",
      }),
    ).toEqual(domain);
    expect(
      effectiveMarketingAssistant(
        { ...settings, defaultModelSelection: null, textGenerationModelSelection: domain },
        providers,
      ),
    ).toEqual(domain);
    expect(effectiveMarketingAssistant(DEFAULT_UNIFIED_SETTINGS, [])).toBeNull();
  });
});

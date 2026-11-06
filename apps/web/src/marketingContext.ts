import { ComposerContextId, type OrchestrationMessageContext } from "@t3tools/contracts";

export function withMarketingWebsite(
  context: OrchestrationMessageContext | undefined,
  website: string | undefined,
  _firstMessage: boolean,
): OrchestrationMessageContext | undefined {
  if (!website) return context;
  return {
    version: 1,
    records: [
      ...(context?.records ?? []),
      {
        version: 1,
        kind: "marketing-website",
        contextId: ComposerContextId.make("marketing-website"),
        label: "Website",
        payload: {
          website,
          instruction:
            "Use this website as the default for local marketing checks unless the user names another.",
        },
      },
    ],
  };
}

export function marketingReturnThread(
  path: string | null,
  threads: readonly { environmentId: string; id: string }[],
) {
  if (!path) return null;
  const [, environmentId, threadId] = path.split("/");
  return (
    threads.find((thread) => thread.environmentId === environmentId && thread.id === threadId) ??
    null
  );
}

export function withMarketingReport(
  context: OrchestrationMessageContext | undefined,
  report: unknown,
): OrchestrationMessageContext | undefined {
  if (!report) return context;
  return {
    version: 1,
    records: [
      ...(context?.records ?? []),
      {
        version: 1,
        kind: "marketing-report",
        contextId: ComposerContextId.make("marketing-report"),
        label: "Current marketing report",
        payload: { report },
      },
    ],
  };
}

export function shouldResumeMarketingDraft(intent: "manage" | "connect-and-send", ready: boolean) {
  return intent === "connect-and-send" && ready;
}
export function marketingApprovalInput(toolName: string | null | undefined, input: unknown) {
  if (!toolName?.endsWith("marketing_tools_run") || input === null || typeof input !== "object")
    return null;
  return input as { name?: string; input?: { url?: string } };
}

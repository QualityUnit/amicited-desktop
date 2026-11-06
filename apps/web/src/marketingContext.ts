import { ComposerContextId, type OrchestrationMessageContext } from "@t3tools/contracts";

export function withMarketingWebsite(
  context: OrchestrationMessageContext | undefined,
  website: string | undefined,
  firstMessage: boolean,
): OrchestrationMessageContext | undefined {
  if (!firstMessage || !website) return context;
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

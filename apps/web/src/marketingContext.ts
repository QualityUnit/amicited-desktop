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
        payload: { report: compactMarketingReport(report) },
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
  if (!("name" in input) || typeof input.name !== "string" || !input.name.trim()) return null;
  return input as { name: string; input?: { url?: string } };
}

export function marketingContextKey(ref: { environmentId: string; threadId: string }) {
  return "amicited.report-context." + JSON.stringify([ref.environmentId, ref.threadId]);
}
export function saveMarketingReport(
  ref: { environmentId: string; threadId: string },
  report: unknown,
) {
  sessionStorage.setItem(marketingContextKey(ref), JSON.stringify(report));
}
export function readMarketingReport(ref: { environmentId: string; threadId: string }) {
  try {
    return JSON.parse(sessionStorage.getItem(marketingContextKey(ref)) ?? "null") as unknown;
  } catch {
    return null;
  }
}
export function clearMarketingReport(ref: { environmentId: string; threadId: string }) {
  sessionStorage.removeItem(marketingContextKey(ref));
}
export function marketingApprovalTool(
  items: readonly import("@t3tools/contracts").OrchestrationV2ProjectedTurnItem[],
  requestId: string,
) {
  const request = items.find(
    (p) => p.item.type === "approval_request" && p.item.requestId === requestId,
  );
  if (!request?.item.runId) return null;
  const matches = items.filter(
    (p) =>
      p.sourceThreadId === request.sourceThreadId &&
      p.item.runId === request.item.runId &&
      p.item.type === "dynamic_tool" &&
      (request.item.parentItemId === p.item.id ||
        (request.item.nativeItemRef != null &&
          p.item.nativeItemRef != null &&
          request.item.nativeItemRef.driver === p.item.nativeItemRef.driver &&
          request.item.nativeItemRef.nativeId === p.item.nativeItemRef.nativeId) ||
        (request.item.nodeId !== null && request.item.nodeId === p.item.nodeId)),
  );
  const tool = matches.length === 1 ? matches[0]?.item : null;
  return tool?.type === "dynamic_tool" && marketingApprovalInput(tool.toolName, tool.input)
    ? tool
    : null;
}
export function marketingHistoryStatus(thread: {
  hasPendingApprovals: boolean;
  latestRun?: { status: string } | null;
  source: { activityRunStatus?: unknown };
}) {
  return thread.hasPendingApprovals
    ? "Needs OK"
    : thread.latestRun?.status === "failed"
      ? "Failed"
      : thread.source.activityRunStatus
        ? "Working"
        : "Done";
}

function compactMarketingReport(report: unknown) {
  if (!report || typeof report !== "object") return null;
  const value = report as Record<string, unknown>;
  const output =
    value.output && typeof value.output === "object"
      ? (value.output as Record<string, unknown>)
      : {};
  const findings = Array.isArray(output.findings)
    ? output.findings
        .filter((f) => f && typeof f === "object" && f.status !== "pass")
        .slice(0, 5)
        .map((f) => ({
          title: String(f.title ?? "").slice(0, 280),
          ...(typeof f.fix === "string" ? { fix: f.fix.slice(0, 600) } : {}),
        }))
    : [];
  return {
    id: String(value.id ?? ""),
    tool: String(value.tool ?? ""),
    score: typeof output.score === "number" && Number.isFinite(output.score) ? output.score : null,
    findings,
    ...(Array.isArray(output.topFixes)
      ? {
          topFixes: output.topFixes
            .filter((fix): fix is string => typeof fix === "string")
            .slice(0, 3)
            .map((fix) => fix.slice(0, 600)),
        }
      : {}),
  };
}

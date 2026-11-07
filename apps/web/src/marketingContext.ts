import { marketingToolResult } from "@amicited/ui-marketing";
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
  source: { activityRunStatus?: unknown; latestMarketingCheckFailed?: boolean | undefined };
}) {
  return thread.hasPendingApprovals
    ? "Needs your OK"
    : thread.latestRun?.status === "failed"
      ? "Couldn't check"
      : thread.source.activityRunStatus
        ? "Working"
        : thread.source.latestMarketingCheckFailed
          ? "Couldn't check"
          : "Done";
}

function compactMarketingReport(report: unknown) {
  if (!report || typeof report !== "object") return null;
  const value = report as Record<string, unknown>;
  const output =
    value.output && typeof value.output === "object"
      ? (value.output as Record<string, unknown>)
      : {};
  const allFindings = Array.isArray(output.groups)
    ? output.groups.flatMap((group) => group?.result?.findings ?? [])
    : output.findings;
  const findings = Array.isArray(allFindings)
    ? allFindings
        .filter((f) => f && typeof f === "object" && f.status !== "pass")
        .toSorted((a, b) => Number(b.status === "fail") - Number(a.status === "fail"))
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
    input: boundedEvidence(value.input),
    evidence: boundedEvidence(
      Object.fromEntries(
        Object.entries(output).filter(([key]) =>
          [
            "draft",
            "message",
            "words",
            "sentences",
            "syllables",
            "readingEase",
            "grade",
            "longSentences",
            "note",
            "suggestions",
            "failedQueries",
            "organic",
            "aiOverview",
            "peopleAlsoAsk",
            "scope",
            "summary",
            "answers",
            "status",
            "coverage",
            "limitations",
          ].includes(key),
        ),
      ),
    ),
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

type Evidence = null | string | number | boolean | Evidence[] | { [key: string]: Evidence };
function boundedEvidence(value: unknown, depth = 0): Evidence {
  if (depth > 5 || value == null) return null;
  if (typeof value === "string") return value.slice(0, 8000);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value))
    return value.slice(0, 12).map((entry) => boundedEvidence(entry, depth + 1));
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, entry]) => [key, boundedEvidence(entry, depth + 1)]),
    );
  return null;
}

export function marketingSubcheckCovered(
  projectedItem: import("@t3tools/contracts").OrchestrationV2ProjectedTurnItem | undefined,
  items: readonly import("@t3tools/contracts").OrchestrationV2ProjectedTurnItem[],
) {
  const currentInput =
    projectedItem?.item.type === "dynamic_tool"
      ? marketingApprovalInput(projectedItem.item.toolName, projectedItem.item.input)
      : null;
  if (
    currentInput &&
    currentInput.input?.url &&
    currentInput.name !== "seo.site.audit" &&
    /^seo\.(robots|sitemap|llmstxt|meta|schema|ssl)\.check$/.test(currentInput.name) &&
    items.some((p) => {
      if (p.item.runId !== projectedItem?.item.runId || p.item.type !== "dynamic_tool")
        return false;
      const audit = marketingApprovalInput(p.item.toolName, p.item.input);
      return (
        audit?.name === "seo.site.audit" &&
        audit.input?.url === currentInput.input?.url &&
        p.item.status === "completed" &&
        (() => {
          const result = marketingToolResult(p.item.output);
          if (result?.status !== "success") return false;
          const output = record(result.output);
          if (output.status !== "checked" && output.status !== "partial") return false;
          const category = currentInput.name.split(".")[1];
          const names: Record<string, string> = {
            robots: "AI crawler access",
            sitemap: "Sitemap check",
            llmstxt: "AI website guide",
            meta: "Search and social preview",
            schema: "Structured data check",
            ssl: "Secure connection",
          };
          return (
            Array.isArray(output.groups) &&
            output.groups.some((group) => {
              const g = record(group);
              const evidence = record(g.result);
              return (
                g.name === names[category ?? ""] &&
                evidence.status === "checked" &&
                typeof evidence.score === "number" &&
                Array.isArray(evidence.findings) &&
                evidence.findings.length > 0 &&
                evidence.findings.every((finding) => record(finding).status !== "unknown")
              );
            })
          );
        })()
      );
    })
  )
    return true;
  return false;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

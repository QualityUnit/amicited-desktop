import type { ToolResult } from "@amicited/tools-core";
import { isUsefulResult, marketingTarget } from "@amicited/tools-core";
import { resultTitle, rankedFindings } from "./experience.js";
import {
  MarketingButton,
  MarketingWorkDisclosure,
  MarketingIcon,
  MarketingDisclosure,
} from "./primitives.js";
export const marketingStarters = [
  "Audit my website for AI search",
  "Check whether ChatGPT and Claude mention my brand",
  "Write or repurpose a LinkedIn post",
  "Find keyword and People Also Ask ideas",
];
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
export function cloudToolResult(
  value: unknown,
  depth = 0,
): { tool: string; result: unknown; arguments?: unknown; target?: string | undefined } | null {
  if (depth > 8) return null;
  if (typeof value === "string") {
    try {
      return cloudToolResult(JSON.parse(value), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value))
    return value.map((part) => cloudToolResult(part, depth + 1)).find(Boolean) ?? null;
  const data = record(value);
  if (data.kind === "amicited-cloud-result" && typeof data.tool === "string")
    return {
      tool: data.tool,
      result: data.result,
      arguments: data.arguments,
      target: typeof data.target === "string" ? data.target : undefined,
    };
  for (const candidate of [data.result, data.structuredContent, data.content, data.text]) {
    const found = candidate === undefined ? null : cloudToolResult(candidate, depth + 1);
    if (found) return found;
  }
  return null;
}
export function marketingToolResult(value: unknown, depth = 0): ToolResult | null {
  if (depth > 6) return null;
  if (typeof value === "string") {
    try {
      return marketingToolResult(JSON.parse(value), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const block of value) {
      const result = marketingToolResult(block, depth + 1);
      if (result) return result;
    }
    return null;
  }
  const r = record(value);

  if (
    typeof r.id === "string" &&
    typeof r.tool === "string" &&
    typeof r.startedAt === "string" &&
    typeof r.durationMs === "number" &&
    (r.status === "success" || r.status === "error") &&
    "input" in r
  )
    return r as unknown as ToolResult;
  if (Array.isArray(r.content))
    for (const block of r.content) {
      const result = marketingToolResult(record(block).text, depth + 1);
      if (result) return result;
    }
  for (const candidate of [
    r.result,
    r.structuredContent,
    r.text,
    typeof r.content === "string" ? r.content : undefined,
  ]) {
    if (candidate !== undefined) {
      const result = marketingToolResult(candidate, depth + 1);
      if (result) return result;
    }
  }
  return null;
}
export function marketingOfferResult(
  value: unknown,
): { tool: string; status: string; output?: unknown } | null {
  const local = marketingToolResult(value);
  if (local) return local;
  const find = (value: unknown, depth = 0): Record<string, unknown> | null => {
    if (depth > 6) return null;
    if (typeof value === "string") {
      try {
        return find(JSON.parse(value), depth + 1);
      } catch {
        return null;
      }
    }
    if (Array.isArray(value))
      return value.map((part) => find(part, depth + 1)).find(Boolean) ?? null;
    const r = record(value);
    if (r.kind === "amicited-connection") return r;
    for (const part of [r.structuredContent, r.content, r.text, r.result]) {
      if (part !== undefined) {
        const found = find(part, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const connection = find(value);
  return connection
    ? {
        tool: "amicited.connection",
        status:
          connection.state === "hidden" || connection.state === "connected" ? "hidden" : "success",
        output: connection,
      }
    : null;
}
export function CompactMarketingResult({
  result,
  open,
  ask,
}: {
  result: ToolResult;
  open: () => void;
  ask?: () => void;
}) {
  const output = record(result.output);
  const useful = isUsefulResult(result);
  return (
    <div className="am-inline-result">
      <article aria-label="Marketing tool result" className="am-tool-card">
        <MarketingWorkDisclosure
          defaultOpen
          label={
            <>
              {useful ? "Ran" : "Couldn't check"} {resultTitle(result).toLowerCase()}
              {marketingTarget(result.input)}
              {useful ? " · " : ""}
              {typeof output.score === "number" ? `${output.score}/100 · ` : ""}
              {useful ? (output.status === "partial" ? "Partial" : "Complete") : ""}
            </>
          }
        >
          <div className="am-work-summary">
            {useful && result.tool === "seo.site.audit" && (
              <p className="am-hint">
                {String(output.coverage ?? "")} · Technical snapshot; doesn't measure AI citations
              </p>
            )}
            {!useful && (
              <p>
                {result.error?.message ??
                  String(output.message ?? "Connect your assistant or try again.")}
              </p>
            )}
            {useful && result.tool !== "seo.site.audit" && (
              <dl>
                {Object.entries(output)
                  .filter(
                    ([key, value]) =>
                      !["status", "score", "coverage", "message"].includes(key) &&
                      ["string", "number", "boolean"].includes(typeof value),
                  )
                  .map(([key, value]) => (
                    <div className="am-finding" key={key}>
                      <dt>
                        {key
                          .replace(/([a-z])([A-Z])/g, "$1 $2")
                          .replace(/^./, (c) => c.toUpperCase())}
                      </dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
              </dl>
            )}
            <ul>
              {rankedFindings(result)
                .slice(0, 3)
                .map((f) => (
                  <li key={`${f.group}:${f.title}`}>{f.title}</li>
                ))}
            </ul>
            <div className="am-result-links">
              <MarketingButton size="xs" variant="outline" onClick={open}>
                Open full result
              </MarketingButton>
              {ask && (
                <MarketingButton size="xs" variant="outline" onClick={ask}>
                  Ask AI about this
                </MarketingButton>
              )}
            </div>
          </div>
        </MarketingWorkDisclosure>
      </article>
    </div>
  );
}

export function marketingPreview(result: ToolResult): string {
  const output = record(result.output);
  for (const key of ["draft", "text", "content"])
    if (typeof output[key] === "string") return output[key].slice(0, 200);
  for (const key of ["keywords", "suggestions", "questions"])
    if (Array.isArray(output[key]))
      return `${output[key].length} ${key}: ${output[key]
        .slice(0, 3)
        .map((v) =>
          typeof v === "string" ? v : String(record(v).keyword ?? record(v).query ?? ""),
        )
        .join(", ")}`;
  return (
    Object.entries(output)
      .filter(([, value]) => typeof value === "number")
      .map(([key, value]) => `${key.replace(/([a-z])([A-Z])/g, "$1 $2")}: ${value}`)
      .join(" · ") || "Your result is ready"
  );
}
export function marketingCallState(status: string | undefined, output: unknown) {
  if (status === "cancelled" || status === "interrupted") return "cancelled";
  if (marketingToolResult(output)) return "completed";
  if (status === "completed" || status === "failed" || status === "error") return "failed";
  return "pending";
}
export function MarketingCallState({
  status,
  output,
  input,
}: {
  input?: unknown;
  status?: string | undefined;
  output: unknown;
}) {
  const state = marketingCallState(status, output);
  const title =
    typeof record(input).tool === "string"
      ? String(record(input).tool)
          .replace(/^free_/, "")
          .replace(/_(start|get)$/, "")
          .replaceAll("_", " ")
      : typeof record(input).name === "string"
        ? resultTitle({ tool: String(record(input).name) }).toLowerCase()
        : "marketing check";
  return (
    <article className="am-tool-card" aria-label="Marketing tool result" data-state={state}>
      <MarketingWorkDisclosure
        defaultOpen
        pending={state === "pending"}
        label={`${state === "pending" ? "Running" : state === "cancelled" ? "Stopped" : "Couldn't check"} ${title}${marketingTarget(record(input).arguments ?? record(input).input)}${state === "pending" ? "…" : ""}`}
      >
        {state === "pending" ? (
          <div className="am-result-skeleton" aria-label="Waiting for result">
            <div />
            <div />
            <div />
          </div>
        ) : (
          <>
            <p>
              {state === "cancelled"
                ? "This check was stopped. You can ask your assistant to try again."
                : marketingErrorText(output)}
            </p>
            <details className="am-technical-details">
              <summary>
                <MarketingIcon name="right" />
                Technical details
              </summary>
              <pre>{typeof output === "string" ? output : JSON.stringify(output, null, 2)}</pre>
            </details>
          </>
        )}
      </MarketingWorkDisclosure>
    </article>
  );
}

export function marketingErrorText(output: unknown): string {
  const r = record(output);
  if (typeof output === "string") return output;
  if (Array.isArray(r.content)) {
    const text = r.content
      .map((block) => record(block).text)
      .filter((v) => typeof v === "string")
      .join("\n");
    if (text) return text;
  }
  return "The tool did not return a usable result.";
}
export function marketingSignInError(message: string): boolean {
  return /could not authenticate|not (?:signed|logged) in|auth login|authentication failed|authentication.*required|invalid.*(?:token|credential)/i.test(
    message,
  );
}

export function CloudToolResultCard({
  cloud,
  onStartTrial,
}: {
  cloud: { tool: string; result: unknown; arguments?: unknown; target?: string | undefined };
  onStartTrial(): void;
}) {
  const result = record(cloud.result);
  const structured = record(result.structuredContent);
  let data = structured;
  if (!result.structuredContent && Array.isArray(result.content)) {
    for (const part of result.content) {
      const text = record(part).text;
      if (typeof text === "string") {
        try {
          data = record(JSON.parse(text));
        } catch {
          data = { message: text };
        }
        break;
      }
    }
  }
  const failed =
    result.isError === true || ["failure", "failed", "error"].includes(String(data.status));
  const discovery = ["list_toolsets", "search_tools", "describe_tool"].includes(cloud.tool);
  const names: Record<string, string> = {
    site_health: "site health",
    brand_visibility: "brand visibility",
    query_fanout: "related searches",
    llms_txt: "AI website guide",
    watermark_detection: "text watermarks",
    watermark_removal: "text cleanup",
  };
  const base = cloud.tool.replace(/^free_/, "").replace(/_(start|get)$/, "");
  const report = record(data.report);
  const score = report.score ?? data.score;
  const fixes = Array.isArray(report.fixes)
    ? report.fixes
        .map((fix) => record(fix).title)
        .filter((title): title is string => typeof title === "string")
        .slice(0, 2)
        .join("; ")
    : undefined;
  const toolTitle = names[base] ?? base.replaceAll("_", " ");
  const target = cloud.target ?? marketingTarget(cloud.arguments, undefined, cloud.tool);
  const title =
    data.code === "plan_required"
      ? `${toolTitle[0]?.toUpperCase()}${toolTitle.slice(1)}${target} needs a plan`
      : data.code === "approval_decline" && cloud.tool.startsWith("delete_")
        ? `Didn't delete ${toolTitle.replace(/^delete /, "")}${target} (you declined)`
        : discovery
          ? "Looked up AmICited tools"
          : `${failed ? "Could not check" : cloud.tool.endsWith("_start") ? "Started checking" : ["running", "pending"].includes(String(data.status)) ? "Checking" : "Checked"} ${toolTitle}${target}`;
  const summary =
    data.code === "plan_required"
      ? "Needs a Pro plan or trial. Free checks still work."
      : [
          data.message,
          data.error,
          data.nextStep,
          cloudSummary(data),
          data.summary,
          typeof score === "number" ? `Score: ${score}/100` : undefined,
          fixes,
        ]
          .filter((v): v is string => typeof v === "string")
          .slice(0, 3)
          .join(" · ") ||
        (discovery
          ? "Found tools and their required inputs."
          : "AmICited returned the check results.");
  return (
    <article className="am-tool-card" aria-label="AmICited tool result">
      <MarketingWorkDisclosure label={title}>
        {!failed && <p>{summary}</p>}
        <MarketingDisclosure label="Technical details">
          <pre>{JSON.stringify(cloud.result, null, 2)}</pre>
        </MarketingDisclosure>
      </MarketingWorkDisclosure>
      {failed && (
        <div className="ms-7.5 text-xs text-muted-foreground">
          <p role="alert">{summary}</p>
          {structured.kind === "amicited-upgrade" && (
            <MarketingButton size="xs" variant="outline" onClick={onStartTrial}>
              Start 7-day free trial
            </MarketingButton>
          )}
        </div>
      )}
    </article>
  );
}

const providerList = (names: string[]) =>
  new Intl.ListFormat("en", { style: "long", type: "conjunction" })
    .format(names)
    .replace(/, and /, " and ");

export function cloudSummary(data: Record<string, unknown>) {
  if (Array.isArray(data.providers)) {
    const rows = data.providers.map(record);
    const name = (row: Record<string, unknown>) =>
      ({ chatgpt: "ChatGPT", perplexity: "Perplexity", gemini: "Gemini", deepseek: "DeepSeek" })[
        String(row.provider).toLowerCase() as "chatgpt"
      ] ?? String(row.provider);
    const mentioned = rows
      .filter((row) => row.status === "success" && row.mentioned === true)
      .map(name);
    const absent = rows
      .filter((row) => row.status === "success" && row.mentioned === false)
      .map(name);
    const failed = rows.filter((row) => row.status === "failure").map(name);
    const scores = rows
      .filter((row) => row.status === "success")
      .flatMap((row) => (typeof row.visibility_score === "number" ? [row.visibility_score] : []));
    return [
      mentioned.length ? `Mentioned by ${providerList(mentioned)}` : undefined,
      absent.length ? `Not mentioned by ${providerList(absent)}` : undefined,
      failed.length ? `Could not check ${providerList(failed)}` : undefined,
      scores.length
        ? `Average visibility ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}/100`
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  if (
    Array.isArray(data.queries) &&
    !["failure", "failed", "error"].includes(String(data.status)) &&
    (data.queries.length > 0 || data.status === "success")
  )
    return `${data.queries.length} related searches${
      data.queries.length
        ? `: ${data.queries
            .slice(0, 2)
            .map((query) => record(query).query_text)
            .join("; ")}`
        : ""
    }`;
  return undefined;
}

export function cloudRunId(value: unknown): string | undefined {
  const cloud = cloudToolResult(value);
  if (!cloud) return undefined;
  const result = record(cloud.result);
  const data = record(
    result.structuredContent ??
      (() => {
        try {
          return JSON.parse(
            String(record(Array.isArray(result.content) ? result.content[0] : undefined).text),
          );
        } catch {
          return undefined;
        }
      })(),
  );
  return typeof data.run_id === "string" ? data.run_id : undefined;
}

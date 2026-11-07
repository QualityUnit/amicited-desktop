import type { ToolResult } from "@amicited/tools-core";
import { isUsefulResult } from "@amicited/tools-core";
import { resultTitle, rankedFindings } from "./experience.js";
import { MarketingButton, MarketingWorkDisclosure, MarketingIcon } from "./primitives.js";
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
): { tool: string; result: unknown } | null {
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
    return { tool: data.tool, result: data.result };
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
              <MarketingButton variant="link" onClick={open}>
                Open full result
              </MarketingButton>
              {ask && (
                <MarketingButton variant="link" onClick={ask}>
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
    typeof record(input).name === "string"
      ? resultTitle({ tool: String(record(input).name) }).toLowerCase()
      : "marketing check";
  return (
    <article className="am-tool-card" aria-label="Marketing tool result" data-state={state}>
      <MarketingWorkDisclosure
        defaultOpen
        pending={state === "pending"}
        label={`${state === "pending" ? "Running" : state === "cancelled" ? "Stopped" : "Couldn't check"} ${title}${marketingTarget(record(input).input)}${state === "pending" ? "…" : ""}`}
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

function marketingTarget(input: unknown) {
  const r = record(input);
  const target = r.url ?? r.website ?? r.domain;
  if (typeof target !== "string" || !target) return "";
  try {
    return ` on ${new URL(target.includes("://") ? target : `https://${target}`).hostname}`;
  } catch {
    return ` on ${target}`;
  }
}

export function CloudToolResultCard({
  cloud,
  onStartTrial,
}: {
  cloud: { tool: string; result: unknown };
  onStartTrial(): void;
}) {
  const result = cloud.result as {
    structuredContent?: { kind?: string; message?: string };
    content?: { text?: string }[];
  };
  const upgrade = result?.structuredContent?.kind === "amicited-upgrade";
  return (
    <article className="am-tool-card" aria-label="AmICited tool result">
      <p>{cloud.tool.replaceAll("_", " ")}</p>
      <p>
        {upgrade
          ? result.structuredContent?.message
          : result?.content?.map((part) => part.text ?? "").join("\n")}
      </p>
      {upgrade && <MarketingButton onClick={onStartTrial}>Start 7-day free trial</MarketingButton>}
    </article>
  );
}

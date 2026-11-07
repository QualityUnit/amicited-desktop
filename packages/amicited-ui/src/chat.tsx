import type { ToolResult } from "@amicited/tools-core";
import { isUsefulResult } from "@amicited/tools-core";
import { resultTitle, rankedFindings } from "./experience.js";
import { MarketingButton } from "./primitives.js";
export const marketingStarters = [
  "Audit my website for AI search",
  "Check whether ChatGPT and Claude mention my brand",
  "Write or repurpose a LinkedIn post",
  "Find keyword and People Also Ask ideas",
];
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
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
export function CompactMarketingResult({ result, open }: { result: ToolResult; open: () => void }) {
  const output = record(result.output);
  const summary = record(output.summary);
  const useful = isUsefulResult(result);
  return (
    <div className="am-inline-result">
      <article aria-label="Marketing tool result" className="am-tool-card">
        <header>
          <strong>{resultTitle(result)}</strong>
          <small className="am-status-pill">
            {useful ? (output.status === "partial" ? "Partial" : "Complete") : "Couldn't check"}
          </small>
        </header>
        {useful && (
          <strong className="am-chat-figure">
            {typeof output.score === "number"
              ? `${output.score}/100`
              : typeof summary.mentioned === "number"
                ? `Mentioned in ${summary.mentioned} of ${summary.answered}`
                : marketingPreview(result)}
          </strong>
        )}
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
        <ul>
          {rankedFindings(result)
            .slice(0, 3)
            .map((f) => (
              <li key={`${f.group}:${f.title}`}>
                <span className={`am-finding-dot am-finding-${f.status}`} />
                {f.title}
              </li>
            ))}
        </ul>
        <p className="am-hint">
          {String(
            record(result.input).url ??
              record(result.input).website ??
              record(result.input).domain ??
              "",
          )
            .replace(/^https?:\/\//, "")
            .replace(/\/$/, "")}
        </p>
        <MarketingButton onClick={open}>Open full result</MarketingButton>
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
  return (
    <article className="am-tool-card" aria-label="Marketing tool result" data-state={state}>
      <header>
        <strong>
          {typeof record(input).name === "string"
            ? resultTitle({ tool: String(record(input).name) })
            : "Marketing check"}
        </strong>
        <small className="am-status-pill">
          {state === "pending"
            ? "Checking…"
            : state === "cancelled"
              ? "Cancelled"
              : "Couldn't check"}
        </small>
      </header>
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
          <details>
            <summary>Show details</summary>
            <pre>{typeof output === "string" ? output : JSON.stringify(output, null, 2)}</pre>
          </details>
        </>
      )}
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

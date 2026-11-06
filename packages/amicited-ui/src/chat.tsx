import type { ToolResult } from "@amicited/tools-core";
import { isUsefulResult } from "@amicited/tools-core";
import { resultTitle, rankedFindings, ResultFooterSlot } from "./experience.js";
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
  for (const candidate of [r.result, r.structuredContent, r.text]) {
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
          <small>{useful ? "Complete" : "Could not check"}</small>
        </header>
        {useful && (
          <strong className="am-chat-figure">
            {typeof output.score === "number"
              ? `${output.score}/100`
              : typeof summary.mentioned === "number"
                ? `Mentioned in ${summary.mentioned} of ${summary.answered}`
                : "Your result is ready"}
          </strong>
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
              <li key={`${f.group}:${f.title}`}>{f.title}</li>
            ))}
        </ul>
        <MarketingButton onClick={open}>Open full result</MarketingButton>
      </article>
      <ResultFooterSlot result={result} />
    </div>
  );
}

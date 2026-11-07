/* oxlint-disable t3code/no-em-dash-copy -- AmICited uses an em dash as its missing-value placeholder. */
import { MarketingWorkDisclosure } from "./primitives.js";
import { MarketingButton } from "./primitives.js";
import { useState, type ComponentProps, type ReactNode } from "react";
import { isUsefulResult, type ToolResult } from "@amicited/tools-core";

export {
  AmICitedMark,
  readBrand,
  saveBrand,
  normalizeWebsite,
  BrandFavicon,
  type Brand,
} from "./brand.js";
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function resultFindings(result: ToolResult) {
  const output = record(result.output);
  const entries = Array.isArray(output.findings)
    ? output.findings
    : Array.isArray(output.issues)
      ? output.issues
      : [];
  const grouped = Array.isArray(output.groups)
    ? output.groups.flatMap((item) => {
        const group = record(item);
        const nested = record(group.result);
        return Array.isArray(nested.findings)
          ? nested.findings.map((finding) => ({
              ...record(finding),
              group: String(group.name ?? "Website"),
              details: nested.details,
            }))
          : [];
      })
    : [];
  return [...entries, ...grouped].map((item) => {
    const f = record(item);
    const status = String(f.status ?? f.severity ?? "warn");
    const details = record(f.details ?? output.details);
    const rawTitle = String(f.title ?? f.message ?? "Finding");
    const title = rawTitle === "Missing" && f.group ? `${String(f.group)}: missing` : rawTitle;
    const evidence =
      title === "Page title"
        ? details.title
        : title === "Search description"
          ? details.description
          : title === "SSL certificate" && details.validTo
            ? `Expires ${String(details.validTo)} (${String(details.daysLeft)} days left)`
            : title.startsWith("Structured data") && Array.isArray(details.types)
              ? details.types.join(", ")
              : undefined;
    return {
      evidence: evidence === undefined ? undefined : String(evidence || "Not found"),
      title: typeof item === "string" ? item : title,
      group: typeof f.group === "string" ? f.group : undefined,
      status:
        status === "unknown"
          ? "unknown"
          : status === "pass" || status === "success"
            ? "pass"
            : status === "fail" || status === "error" || status === "critical"
              ? "fail"
              : "warn",
      why: String(f.whyItMatters ?? f.why ?? f.description ?? ""),
      fix: String(f.fix ?? f.recommendation ?? ""),
    };
  });
}
export function rankedFindings(result: ToolResult) {
  const order: Record<string, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 };
  return resultFindings(result).sort((a, b) => (order[a.status] ?? 2) - (order[b.status] ?? 2));
}
export function resultTone(result: ToolResult) {
  const findings = resultFindings(result);
  if (result.status === "error") return "unavailable";
  if (findings.some((f) => f.status === "fail")) return "critical";
  if (findings.some((f) => f.status === "warn")) return "warning";
  if (!findings.length || findings.some((f) => f.status === "unknown")) return "unavailable";
  return "good";
}
export function friendlyAssistant(value: string) {
  return /claude/i.test(value)
    ? "Claude"
    : /codex|chatgpt/i.test(value)
      ? "ChatGPT"
      : /gemini/i.test(value)
        ? "Gemini"
        : value;
}
function humanLabel(key: string) {
  const text = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}
export function formatResultValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime()))
      return date.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });
  }
  return String(value);
}
function ResultValue({ value }: { value: unknown }): ReactNode {
  if (Array.isArray(value))
    return value.length ? (
      <ol className="am-report-list">
        {value.map((item, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- Completed results are immutable and can contain duplicate entries.
          <li key={index}>
            <ResultValue value={item} />
          </li>
        ))}
      </ol>
    ) : (
      "None"
    );
  if (value !== null && typeof value === "object")
    return (
      <dl>
        {Object.entries(value).map(([key, item]) => (
          <div className="am-finding" key={key}>
            <dt>{humanLabel(key)}</dt>
            <dd>
              <ResultValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return (
    <span className={typeof value === "number" ? "am-number" : undefined}>
      {formatResultValue(value)}
    </span>
  );
}
export function resultTitle(result: Pick<ToolResult, "tool">) {
  const titles: Record<string, string> = {
    "seo.site.audit": "Website health audit",
    "seo.robots.check": "AI crawler access",
    "seo.sitemap.check": "Sitemap check",
    "seo.llmstxt.check": "AI website guide",
    "seo.meta.check": "Search and social preview",
    "seo.schema.check": "Structured data check",
    "seo.ssl.check": "Secure connection check",
    "ai.visibility.check": "AI visibility check",
    "content.readability": "Readability check",
    "content.write": "Marketing draft",
    "content.repurpose": "Repurposed content",
    "content.brief": "Content brief",
    "serp.autocomplete": "Keyword ideas",
    "serp.fetch": "Google search results",
    "serp.paa": "People also ask",
  };
  return titles[result.tool] ?? result.tool.split(".").map(humanLabel).join(" · ");
}
function markdownValue(value: unknown, depth = 2): string {
  if (Array.isArray(value))
    return value
      .map((v) => (typeof v === "object" ? markdownValue(v, depth) : `- ${formatResultValue(v)}`))
      .join("\n");
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(
        ([k, v]) =>
          `${"#".repeat(Math.min(depth, 6))} ${humanLabel(k)}\n\n${markdownValue(v, depth + 1)}`,
      )
      .join("\n\n");
  return formatResultValue(value);
}
export function resultQuestion(result: ToolResult) {
  const issues = rankedFindings(result).filter((f) => f.status !== "pass").length;
  const score = record(result.output).score;
  return `Help me ${issues ? `fix the ${issues} issues from` : "understand"} my ${resultTitle(result).toLowerCase()}${typeof score === "number" ? ` (${score}/100)` : ""}.`;
}
export function resultMarkdown(result: ToolResult) {
  const title = `# ${resultTitle(result)}\n\n`;
  if (result.status === "error") return title + (result.error?.message ?? "Could not check");
  const output = record(result.output);
  if (typeof output.draft === "string") return title + output.draft;
  const findings = resultFindings(result);
  if (findings.length)
    return (
      title +
      [
        typeof output.score === "number" ? `Score: ${output.score}/100` : "Score unavailable",
        output.coverage,
        Array.isArray(output.topFixes)
          ? `## Start here\n\n${output.topFixes.map((v) => `- ${String(v)}`).join("\n")}`
          : "",
        ...findings.map(
          (f) =>
            `## ${f.title} (${f.status})\n\n${f.why}\n\n${f.fix ? `How to fix: ${f.fix}` : ""}`,
        ),
        output.groups ? `## Measured evidence\n\n${markdownValue(output.groups)}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  return title + markdownValue(output);
}
export function MarketingResult({
  result,
  retry,
  rerun,
  fix,
  title,
}: {
  title?: string;
  result: ToolResult;
  retry?: () => void;
  rerun?: () => Promise<void>;
  fix?: ((prompt: string, result: ToolResult) => Promise<void>) | undefined;
}) {
  const [error, setError] = useState("");
  const findings = rankedFindings(result);
  const useful = isUsefulResult(result);
  const output = record(result.output);
  return (
    <section className="am-page" aria-label="Tool result">
      <h1 className="sr-only">{title ?? resultTitle(result)}</h1>
      <p className="am-hint">
        {String(record(result.input).url ?? record(result.input).website ?? "")
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, "")}{" "}
        ·{" "}
        {new Date(result.startedAt).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}
      </p>
      <article className="am-tool-card">
        <p>
          {useful
            ? "One-time check on your machine"
            : (result.error?.message ?? "Could not check. Connect your assistant or try again.")}
        </p>
        {useful && typeof output.score === "number" && (
          <strong className="am-chat-figure">{output.score}/100</strong>
        )}
        {useful && result.tool === "seo.site.audit" && (
          <p className="am-hint">
            {output.status === "partial" ? "Partial" : "Complete"} · {String(output.coverage ?? "")}{" "}
            · Technical snapshot; doesn't measure AI citations
          </p>
        )}
        {findings.length ? (
          <div className="am-result-findings">
            {findings.map((f) => (
              <article key={`${f.group}:${f.title}`}>
                <small>
                  {
                    {
                      fail: "Needs attention",
                      warn: "Improve",
                      pass: "Passing",
                      unknown: "Couldn't check",
                    }[f.status]
                  }
                </small>
                <h2>{f.title}</h2>
                <p>{f.why}</p>
                <p>{f.fix}</p>
                {f.evidence && <p>{f.evidence}</p>}
              </article>
            ))}
          </div>
        ) : result.tool === "content.readability" ? (
          <>
            <strong className="am-chat-figure">
              Reading ease: {String(output.readingEase ?? "Unavailable")}
            </strong>
            <p>
              {typeof output.grade === "number"
                ? `Grade ${output.grade}: approximately US school year ${Math.max(1, Math.round(output.grade))} reading level. Lower grades are easier to read.`
                : "Not enough text to assess reading level."}
            </p>
            <ResultValue
              value={Object.fromEntries(
                Object.entries(output).filter(([key]) => key !== "readingEase" && key !== "grade"),
              )}
            />
          </>
        ) : (
          <ResultValue value={result.output} />
        )}
        {findings.length > 0 && (
          <MarketingWorkDisclosure label="All check details">
            <ResultValue value={result.output} />
          </MarketingWorkDisclosure>
        )}
        <div className="am-actions">
          {retry && <MarketingButton onClick={retry}>Edit inputs</MarketingButton>}
          {rerun && (
            <MarketingButton onClick={() => void rerun().catch((e: Error) => setError(e.message))}>
              Run again
            </MarketingButton>
          )}
          {fix && (
            <MarketingButton
              variant="default"
              onClick={() =>
                void fix(resultQuestion(result), result).catch((e: Error) => setError(e.message))
              }
            >
              Ask AI about this
            </MarketingButton>
          )}
          <MarketingButton
            onClick={() =>
              void navigator.clipboard
                .writeText(resultMarkdown(result))
                .catch(() => setError("Could not copy this result."))
            }
          >
            Copy result
          </MarketingButton>
        </div>
        {error && <p role="alert">{error}</p>}
      </article>
    </section>
  );
}

export function marketingNavigate(path: string) {
  window.dispatchEvent(new CustomEvent("amicited-navigate", { detail: path }));
}

export function MarketingLink({ href, onClick, ...props }: ComponentProps<"a">) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          href?.startsWith("/") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          event.button === 0
        ) {
          event.preventDefault();
          marketingNavigate(href);
        }
      }}
    />
  );
}

export function marketingTaskStatus(status: string | undefined, needsInput: boolean) {
  if (status === "failed") return "Couldn't finish";
  if (needsInput) return "Needs you";
  if (status === "interrupted" || status === "cancelled") return "Stopped";
  if (status === "completed") return "Done";
  if (status === "running") return "Working";
  return "Ready";
}

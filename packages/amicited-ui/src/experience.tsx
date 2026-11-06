import { ChevronDown } from "lucide-react";
import { AmICitedBot } from "./AmICitedBot.js";
import { MarketingShell } from "./shell.js";
/* oxlint-disable t3code/no-em-dash-copy -- AmICited uses an em dash as its missing-value placeholder. */
import {
  MarketingButton,
  MarketingInput,
  KpiTile,
  SectionHead,
  MarketingIcon,
  MarketingToolbar,
  MarketingScope,
  MarketingTitle,
  toolIcon,
} from "./primitives.js";
import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import type { ToolResult } from "@amicited/tools-core";
import {
  AmICitedMark,
  readBrand,
  saveBrand,
  normalizeWebsite,
  BrandFavicon,
  type Brand,
} from "./brand.js";
export {
  AmICitedMark,
  readBrand,
  saveBrand,
  normalizeWebsite,
  BrandFavicon,
  type Brand,
} from "./brand.js";
export function FirstRun({
  ready = true,
  subscriptions,
  prepare,
  check,
  skip,
  fix,
}: {
  ready?: boolean;
  subscriptions: ReactNode;
  prepare: (brand: Brand) => Promise<void>;
  check: (brand: Brand) => Promise<ToolResult>;
  skip: () => void;
  fix: (prompt: string) => Promise<void>;
}) {
  const [website, setWebsite] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ToolResult | null>(null);
  if (result)
    return (
      <MarketingShell path="/tools/seo.site.audit" navigate={marketingNavigate}>
        <MarketingTitle>Website health audit</MarketingTitle>
        <MarketingResult
          result={result}
          fix={fix}
          retry={() => {
            setResult(null);
            setBrand(null);
          }}
        />
        <section className="am-card" id="ai-subscriptions">
          <h2>Want AI to fix these?</h2>
          <p>Connect Claude or ChatGPT using your existing subscription.</p>
          {subscriptions}
        </section>
        <MarketingButton onClick={skip}>Go to Home →</MarketingButton>
      </MarketingShell>
    );
  return (
    <div data-amicited-shell="" className="am-page am-onboarding">
      <AmICitedMark />
      <p className="am-eyebrow">Your first win starts here</p>
      <h1>What’s your website?</h1>
      <p>Find out what’s helping your visibility, and what to improve next.</p>
      {brand && (
        <p className="am-card">
          <b>{brand.name}</b> · {brand.website}{" "}
          <MarketingButton variant="link" onClick={() => setBrand(null)}>
            Edit
          </MarketingButton>
        </p>
      )}
      {!brand && (
        <form
          className="am-card"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              const parsed = normalizeWebsite(website);
              const next = { ...parsed, name: name.trim() || parsed.name };
              await prepare(next);
              saveBrand(next);
              setBrand(next);
              setResult(await check(next));
              localStorage.setItem("amicited.onboarded", "true");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not get ready. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Website URL
            <MarketingInput
              required
              placeholder="https://your-website.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
          <label>
            Brand name <span className="am-hint">(optional)</span>
            <MarketingInput
              placeholder="We’ll use your domain"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="am-onboarding-actions">
            <MarketingButton variant="default" disabled={busy || !ready}>
              {busy ? "Checking your website…" : brand ? "Update website" : "Continue"}
            </MarketingButton>
            <MarketingButton type="button" variant="link" onClick={skip}>
              Skip for now
            </MarketingButton>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      <small>Free local tools. No AmICited account needed.</small>
    </div>
  );
}
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
      why: String(
        f.whyItMatters ??
          f.why ??
          f.description ??
          "This can affect how people and search engines experience your website.",
      ),
      fix: String(
        f.fix ?? f.recommendation ?? "Ask your AI assistant to investigate and suggest a fix.",
      ),
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
function AnalysisBanner({
  tone,
  lead,
  action,
  counts,
  detail,
}: {
  tone: "critical" | "warning" | "good" | "unavailable";
  lead: string;
  counts?: string;
  detail?: string;
  action?: (() => void) | undefined;
}) {
  return (
    <details className={`am-analysis am-analysis--${tone}`}>
      <summary>
        <AmICitedBot
          mood={
            tone === "good"
              ? "happy"
              : tone === "critical"
                ? "concerned"
                : tone === "warning"
                  ? "watch"
                  : "busy"
          }
          size={34}
        />
        <span className="am-analysis-eyebrow">
          {
            {
              good: "ALL CLEAR",
              critical: "ATTENTION",
              warning: "WORTH IMPROVING",
              unavailable: "COULD NOT CHECK",
            }[tone]
          }
        </span>
        <span className="am-analysis-lead">{lead}</span>
        {counts && <span className="am-analysis-count">{counts}</span>}
        {action && tone !== "good" && (
          <MarketingButton
            variant="link"
            onClick={(event) => {
              event.preventDefault();
              action();
            }}
          >
            Fix with AI →
          </MarketingButton>
        )}
        <ChevronDown className="am-banner-chevron" size={16} aria-hidden="true" />
      </summary>
      <p>{detail ?? "One-time check using the scope shown above. No daily history is measured."}</p>
    </details>
  );
}
function humanLabel(key: string) {
  const text = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
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
      <ul>
        {value.map((item, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- Completed results are immutable and can contain duplicate entries.
          <li key={index}>
            <ResultValue value={item} />
          </li>
        ))}
      </ul>
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
export function resultTitle(result: ToolResult) {
  const titles: Record<string, string> = {
    "seo.site.audit": "Website health audit",
    "ai.visibility.check": "AI visibility check",
    "content.readability": "Readability check",
    "content.write": "Marketing draft",
    "content.repurpose": "Repurposed content",
    "content.brief": "Content brief",
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
function VisibilityResult({
  output,
  fix,
}: {
  output: Record<string, unknown>;
  fix?: ((prompt: string) => Promise<void>) | undefined;
}) {
  const summary = record(output.summary);
  const competitors = Array.isArray(summary.competitors) ? summary.competitors.map(record) : [];
  const total = competitors.reduce(
    (n, c) => n + (typeof c.answers === "number" ? c.answers : 0),
    typeof summary.mentioned === "number" ? summary.mentioned : 0,
  );
  const share =
    typeof summary.mentioned === "number" && total > 0
      ? (summary.mentioned / total) * 100
      : summary.shareOfVoice;
  const series = [
    { brand: output.brand ?? readBrand()?.name ?? "Your brand", answers: summary.mentioned },
    ...competitors,
  ]
    .map((c, i) => ({
      brand: String(c.brand),
      answers: typeof c.answers === "number" ? c.answers : null,
      you: i === 0,
      color:
        i === 0 ? "var(--ai-accent)" : ["#22c1c3", "#f7a93d", "#e85d75", "#9b6dff"][(i - 1) % 4],
      share:
        typeof c.answers === "number" && total > 0
          ? `${((c.answers / total) * 100).toFixed(1)}%`
          : "—",
    }))
    .sort((a, b) => (b.answers ?? 0) - (a.answers ?? 0));
  const [error, setError] = useState("");
  return (
    <div>
      <AnalysisBanner
        tone={
          Number(summary.answered) === 0
            ? "unavailable"
            : Number(summary.mentioned) === Number(summary.answered)
              ? "good"
              : "warning"
        }
        lead={`Mentioned in ${formatResultValue(summary.mentioned)} of ${formatResultValue(summary.answered)} answers`}
        action={
          fix
            ? () =>
                void fix("Help improve my brand's AI visibility using this check.").catch(
                  (e: Error) => setError(e.message),
                )
            : undefined
        }
      />
      <div className="am-visibility-report">
        <div className="am-run-overview">
          <div className="am-kpis">
            <KpiTile
              label="Brand mentions"
              value={summary.mentioned == null ? null : String(summary.mentioned)}
              hint="Across answered prompts"
            />
            <KpiTile
              label="Share of voice"
              value={share == null ? null : `${Number(share).toFixed(1)}%`}
              hint="Among supplied brands"
            />
            <KpiTile
              label="Answers checked"
              value={summary.answered == null ? null : String(summary.answered)}
              hint="One assistant · this run"
            />
          </div>
          <div className="am-current-bars">
            <SectionHead title="Mentions in this check" />
            {series.map((c) => (
              <div className="am-current-bar" key={String(c.brand)}>
                <span className="am-bar-identity">
                  <BrandFavicon name={c.brand} />
                  <span>{c.brand}</span>
                </span>
                <div>
                  <span
                    style={{
                      background: c.color,
                      width:
                        typeof c.answers === "number" &&
                        typeof summary.answered === "number" &&
                        summary.answered > 0
                          ? `${Math.min(100, (c.answers / summary.answered) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
                <span className="am-number">{formatResultValue(c.answers)}</span>
              </div>
            ))}
          </div>
          <p className="am-run-scope">{String(output.message ?? "")}</p>
        </div>
        <section className="am-brand-legend">
          <SectionHead title="Brand comparison" actions={<span className="am-hint">Share</span>} />
          {series.map((c) => (
            <div className="am-brand-row" key={c.brand}>
              <span className="am-series-dot" style={{ background: c.color }} />
              <BrandFavicon name={c.brand} website={c.you ? readBrand()?.website : undefined} />
              <span className="am-brand-name">{c.brand}</span>
              {c.you && <span className="am-you">you</span>}
              <span className="am-number">{c.share}</span>
            </div>
          ))}
        </section>
      </div>
      {Array.isArray(output.answers) && (
        <section className="am-card am-answers">
          <SectionHead title="Answers in this check" />
          {output.answers.map((v) => {
            const a = record(v);
            return (
              <article className="am-answer-row" key={String(a.prompt)}>
                <div className="am-answer-head">
                  <h3>{String(a.prompt)}</h3>
                  <span
                    className={`am-status am-status-${a.mentioned === true ? "pass" : a.mentioned === false ? "warn" : "unknown"}`}
                  >
                    {a.mentioned === true
                      ? "Mentioned"
                      : a.mentioned === false
                        ? "Not mentioned"
                        : "Could not check"}
                  </span>
                  <p>
                    Position: <span className="am-number">{formatResultValue(a.position)}</span>
                  </p>
                </div>
                <p>{String(a.excerpt ?? "No answer available").slice(0, 700)}</p>
                <p>
                  Cited domains:{" "}
                  {Array.isArray(a.citations) && a.citations.length
                    ? a.citations
                        .map((c) => {
                          try {
                            return new URL(String(c)).hostname;
                          } catch {
                            return String(c);
                          }
                        })
                        .join(", ")
                    : "None"}
                </p>
                {a.mentioned === false && fix && (
                  <MarketingButton
                    variant="link"
                    aria-label="Fix this with AI"
                    onClick={() =>
                      void fix(
                        `Help my brand become a useful recommendation for: ${String(a.prompt)
                          .trim()
                          .replace(/[.!?]+$/, "")}. Suggest evidence and content improvements.`,
                      ).catch((error: Error) => setError(error.message))
                    }
                  >
                    Fix with AI →
                  </MarketingButton>
                )}
              </article>
            );
          })}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export const ResultFooterContext = createContext<((result: ToolResult) => ReactNode) | null>(null);
export function ResultFooterSlot({ result }: { result: ToolResult }) {
  const render = useContext(ResultFooterContext);
  return render?.(result) ?? null;
}
export function MarketingResult({
  result,
  retry,
  fix,
}: {
  result: ToolResult;
  retry?: () => void;
  fix?: ((prompt: string) => Promise<void>) | undefined;
}) {
  const [error, setError] = useState("");
  const output = record(result.output);
  const findings = resultFindings(result);
  const needsProvider = output.status === "needs_provider";
  const ranked = rankedFindings(result);
  const findingRows = ranked.map((f, i) => (
    // oxlint-disable-next-line react/no-array-index-key -- Findings are immutable snapshots and can share a title within one group.
    <article className="am-finding-row" key={`${f.group}:${f.title}:${i}`}>
      <span className={`am-status am-status-${f.status}`}>
        {i < 3 ? `${i + 1} · ` : ""}
        {
          {
            fail: "To fix",
            warn: "Improve",
            pass: "Passing",
            unknown: "Unavailable",
          }[f.status]
        }
      </span>
      <div>
        <strong>{f.title}</strong> {f.evidence && <span>{f.evidence}</span>}
        <details>
          <summary>Why / How</summary>
          <p>{f.why}</p>
          <p>{f.fix}</p>
        </details>
      </div>
      {fix && f.status !== "pass" && (
        <MarketingButton
          variant="link"
          onClick={() =>
            void fix(
              `Help me fix this on ${String(record(result.input).url ?? readBrand()?.website ?? "my website")}: ${f.title}\n${f.why}\n${f.fix}`,
            ).catch((e: Error) => setError(e.message))
          }
        >
          Fix with AI →
        </MarketingButton>
      )}
    </article>
  ));

  return (
    <section className="am-result" aria-label="Tool result">
      {retry && (
        <MarketingToolbar>
          <MarketingButton onClick={retry}>Edit inputs</MarketingButton>
          <MarketingButton onClick={retry}>Run again</MarketingButton>
        </MarketingToolbar>
      )}
      <MarketingScope>
        {Object.entries(record(result.input))
          .filter(
            ([key, value]) =>
              ["url", "website", "brand", "market", "category"].includes(key) &&
              typeof value === "string",
          )
          .map(([key, value]) => (
            <span key={key}>
              <MarketingIcon name={toolIcon(key === "url" ? "website" : key)} />
              <span>{key === "url" ? "Website" : humanLabel(key)}</span> {String(value)}
            </span>
          ))}
        {typeof output.provider === "string" && (
          <span>
            <MarketingIcon name="assistant" />
            <span>Assistant</span>
            {friendlyAssistant(output.provider)}
          </span>
        )}
      </MarketingScope>
      {needsProvider ? (
        <div className="am-finding">
          <h3>Connect Claude or ChatGPT</h3>
          <p>
            {result.tool.startsWith("content.")
              ? "This content action uses your existing AI subscription to write or repurpose your draft. Connect an assistant, then return here to generate it."
              : "This check uses your existing AI subscription to see whether your assistant mentions your brand. Connect an assistant, then return here to run the check."}
          </p>
          <a
            href="/home#ai-subscriptions"
            onClick={(event) => {
              event.preventDefault();
              marketingNavigate("/home#ai-subscriptions");
            }}
          >
            Connect your AI assistant →
          </a>
          <p>Your local website checks remain free and work without AI.</p>
        </div>
      ) : result.status === "error" ? (
        <>
          <p>{result.error?.message ?? "The check could not finish. Try again."}</p>
          <MarketingButton onClick={retry}>Try again</MarketingButton>
        </>
      ) : (
        <>
          {findings.length > 0 && (
            <AnalysisBanner
              tone={resultTone(result)}
              lead={ranked[0]?.title ?? "Check completed"}
              detail={String(output.coverage ?? "Basic website checks completed.")}
              counts={findings.length > 1 ? `+${findings.length - 1} more` : ""}
              action={
                fix
                  ? () =>
                      void fix(
                        `Help me fix this on ${String(record(result.input).url ?? readBrand()?.website ?? "my website")}: ${ranked[0]?.title}\n${ranked[0]?.why}\n${ranked[0]?.fix}`,
                      ).catch((e: Error) => setError(e.message))
                  : undefined
              }
            />
          )}
          <div className="am-kpis">
            {typeof output.score === "number" && (
              <KpiTile
                label="Audit score"
                value={`${output.score}/100`}
                hint="Basic website checks"
              />
            )}
            {findings.length > 0 && (
              <>
                <KpiTile
                  label="To fix"
                  value={findings.filter((f) => f.status === "fail").length}
                />
                <KpiTile
                  label="Worth improving"
                  value={findings.filter((f) => f.status === "warn").length}
                />
                <KpiTile
                  label="Passing"
                  value={findings.filter((f) => f.status === "pass").length}
                />
              </>
            )}
            {typeof output.readingEase === "number" && (
              <KpiTile
                label="Reading ease"
                value={output.readingEase}
                hint="Higher is easier to read"
              />
            )}
            {typeof output.grade === "number" && (
              <KpiTile label="Reading grade" value={output.grade} />
            )}
            {typeof record(output.details).daysLeft === "number" && (
              <KpiTile label="SSL days left" value={String(record(output.details).daysLeft)} />
            )}
            {typeof output.words === "number" && <KpiTile label="Words" value={output.words} />}
            {Array.isArray(output.organic) && output.status === "checked" && (
              <KpiTile
                label="Search results"
                value={output.organic.length}
                hint="From this machine"
              />
            )}
          </div>
          {typeof output.readingEase === "number" && (
            <p>
              {output.readingEase >= 60
                ? "Easy to read. Good for most audiences."
                : output.readingEase >= 30
                  ? "Somewhat complex. Try shorter sentences."
                  : "Hard to read. Simplify words and sentences."}
            </p>
          )}

          {findings.length > 0 && (
            <>
              <section className="am-card am-findings-list">
                <SectionHead
                  title={resultTone(result) === "good" ? "Checks passing" : "Start here"}
                  subtitle={`${Math.min(3, findings.length)} of ${findings.length} findings, most important first`}
                />
                {findingRows.slice(0, 3)}
              </section>
              <ResultFooterSlot result={result} />
              {findingRows.length > 3 && (
                <details className="am-card am-findings-list">
                  <summary>All findings · {findingRows.length}</summary>
                  {findingRows.slice(3)}
                </details>
              )}
            </>
          )}
          {Array.isArray(output.groups) && (
            <details className="am-card am-findings-list">
              <summary>Measured evidence</summary>
              {output.groups.map((v) => {
                const g = record(v);
                return (
                  <section className="am-evidence" key={String(g.name)}>
                    <h3>{String(g.name)}</h3>
                    <ResultValue value={record(g.result).details} />
                  </section>
                );
              })}
            </details>
          )}
          {result.tool === "ai.visibility.check" && (
            <VisibilityResult output={{ ...output, brand: record(result.input).brand }} fix={fix} />
          )}
          {!findings.length && result.tool !== "ai.visibility.check" && (
            <dl>
              {Object.entries(output)
                .filter(
                  ([key]) => !["score", "readingEase", "grade", "words", "note"].includes(key),
                )
                .map(([key, value]) => (
                  <div className="am-finding" key={key}>
                    <dt>{humanLabel(key)}</dt>
                    <dd>
                      <ResultValue value={value} />
                    </dd>
                  </div>
                ))}
            </dl>
          )}
          {result.tool === "serp.fetch" && (
            <p>
              AI Overview:{" "}
              {record(output.aiOverview).present == null
                ? "Could not check"
                : record(output.aiOverview).present
                  ? "Present"
                  : "Not present"}
            </p>
          )}
          {typeof output.note === "string" && <p className="am-hint">{output.note}</p>}
          {result.tool === "serp.fetch" && output.status !== "checked" && (
            <a
              href={
                "https://www.google.com/search?" +
                new URLSearchParams({ q: String(record(result.input).query ?? "") })
              }
              target="_blank"
              rel="noreferrer"
            >
              Open this search →
            </a>
          )}
          <MarketingToolbar>
            <MarketingButton
              aria-label="Copy results"
              onClick={() =>
                void navigator.clipboard
                  .writeText(resultMarkdown(result))
                  .catch(() => setError("Could not copy. Try exporting instead."))
              }
            >
              <MarketingIcon name="copy" />
            </MarketingButton>
            <MarketingButton
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([resultMarkdown(result)], { type: "text/markdown" }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = result.tool.replaceAll(".", "-") + ".md";
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              <MarketingIcon name="download" />
              Download
            </MarketingButton>
          </MarketingToolbar>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {!findings.length && <ResultFooterSlot result={result} />}
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

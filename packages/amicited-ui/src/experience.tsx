import { MarketingShell } from "./shell.js";
/* oxlint-disable t3code/no-em-dash-copy -- AmICited uses an em dash as its missing-value placeholder. */
import {
  MarketingButton,
  MarketingInput,
  KpiTile,
  SectionHead,
  MarketingIcon,
  MarketingToolbar,
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
      <MarketingShell
        path="/tools/seo.site.audit"
        navigate={marketingNavigate}
        headerActions={<MarketingButton onClick={skip}>Go to Home →</MarketingButton>}
      >
        <div className="am-result-heading">
          <h2>Your first useful result</h2>
        </div>
        <MarketingResult result={result} fix={fix} retry={() => setResult(null)} />
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
      <p className="am-eyebrow">YOUR FIRST WIN STARTS HERE</p>
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
          <MarketingButton variant="default" disabled={busy || !ready}>
            {busy ? "Checking your website…" : brand ? "Update website" : "Continue"}
          </MarketingButton>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        <MarketingButton variant="link" onClick={skip}>
          Skip for now
        </MarketingButton>
      </p>
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
    const title = String(f.title ?? f.message ?? "Finding");
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
      title: String(f.title ?? f.message ?? (typeof item === "string" ? item : "Finding")),
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
  const [error, setError] = useState("");
  return (
    <div>
      <div className="am-scope-filters">
        {typeof output.provider === "string" && (
          <span>
            <MarketingIcon name="ai-visibility" />
            <span>Assistant</span>
            {output.provider}
          </span>
        )}
      </div>
      <div className="am-analysis">
        <MarketingIcon name="ai-visibility" />
        <span className="am-status am-status-neutral">This check</span>
        <SectionHead
          title={`Mentioned in ${formatResultValue(summary.mentioned)} of ${formatResultValue(summary.answered)} answers`}
        />
      </div>
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
            {[
              { brand: output.brand ?? "Your brand", answers: summary.mentioned },
              ...competitors,
            ].map((c) => (
              <div className="am-current-bar" key={String(c.brand)}>
                <span>{String(c.brand)}</span>
                <div>
                  <span
                    style={{
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
          {(() => {
            const own = typeof summary.mentioned === "number" ? summary.mentioned : null;
            const total = competitors.reduce(
              (n, c) => n + (typeof c.answers === "number" ? c.answers : 0),
              own ?? 0,
            );
            return [
              { brand: output.brand ?? readBrand()?.name ?? "Your brand", answers: own, you: true },
              ...competitors,
            ]
              .map((c, i) => ({
                brand: c.brand,
                answers: c.answers,
                you: i === 0,
                color:
                  i === 0
                    ? "var(--ai-accent)"
                    : ["#22c1c3", "#f7a93d", "#e85d75", "#9b6dff"][(i - 1) % 4],
              }))
              .sort((a, b) => Number(b.answers ?? 0) - Number(a.answers ?? 0))
              .map((c) => (
                <div className="am-brand-row" key={String(c.brand)}>
                  <span
                    className="am-series-dot"
                    style={{
                      background: c.color,
                    }}
                  />
                  <BrandFavicon
                    name={String(c.brand)}
                    website={
                      c.you && String(c.brand) === readBrand()?.name
                        ? readBrand()?.website
                        : undefined
                    }
                  />
                  <span className="am-brand-name">{String(c.brand)}</span>
                  {c.you && <span className="am-you">you</span>}
                  <span className="am-number">
                    {typeof c.answers === "number" && total > 0
                      ? `${((c.answers / total) * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              ));
          })()}
        </section>
      </div>
      {Array.isArray(output.answers) &&
        output.answers.map((v) => {
          const a = record(v);
          return (
            <article className="am-finding am-answer-row" key={String(a.prompt)}>
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
                  onClick={() =>
                    void fix(
                      `Help my brand become a useful recommendation for: ${String(a.prompt)
                        .trim()
                        .replace(/[.!?]+$/, "")}. Suggest evidence and content improvements.`,
                    ).catch((error: Error) => setError(error.message))
                  }
                >
                  Fix this with AI
                </MarketingButton>
              )}
            </article>
          );
        })}
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
  return (
    <section className="am-card" aria-label="Tool result">
      <p className="am-result-kind">
        {result.tool === "ai.visibility.check"
          ? "AI VISIBILITY"
          : result.tool.startsWith("seo.")
            ? "WEBSITE CHECK"
            : "TOOL RESULTS"}
      </p>
      {result.tool !== "ai.visibility.check" && (
        <h2>
          {result.status === "error" ||
          ["could_not_check", "could_not_generate"].includes(String(output.status))
            ? "Could not complete this check"
            : "Your results"}
        </h2>
      )}
      <div className="am-scope-filters">
        {Object.entries(record(result.input))
          .filter(
            ([key, value]) =>
              ["url", "website", "brand", "market", "category"].includes(key) &&
              typeof value === "string",
          )
          .map(([key, value]) => (
            <span key={key}>
              <MarketingIcon name="website" />
              <span>{key === "url" ? "Website" : humanLabel(key)}</span> {String(value)}
            </span>
          ))}
      </div>
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
          <div className="am-kpis">
            {typeof output.score === "number" && (
              <KpiTile
                label="Audit score"
                value={`${output.score}/100`}
                hint="Basic website checks"
              />
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
            <div className="am-analysis">
              <MarketingIcon name="ai-visibility" />
              <span
                className={`am-status am-status-${findings.some((f) => f.status === "fail") ? "fail" : "warn"}`}
              >
                {findings.some((f) => f.status === "fail") ? "Needs attention" : "Review"}
              </span>
              <span>{String(output.coverage ?? "Basic website checks completed.")}</span>
              <span className="am-analysis-count">
                {findings.filter((f) => f.status === "fail").length} to fix ·{" "}
                {findings.filter((f) => f.status === "warn").length} worth improving ·{" "}
                {findings.filter((f) => f.status === "pass").length} passing
              </span>
            </div>
          )}
          {Array.isArray(output.topFixes) && output.topFixes.length > 0 && (
            <section className="am-finding">
              <SectionHead title="Start here" />
              <ol>
                {output.topFixes.map((v) => (
                  <li key={String(v)}>{String(v)}</li>
                ))}
              </ol>
            </section>
          )}
          {findings.length > 0 && <ResultFooterSlot result={result} />}
          {Array.isArray(output.groups) && (
            <details>
              <summary>Measured evidence</summary>
              {output.groups.map((v) => {
                const g = record(v);
                return (
                  <section key={String(g.name)}>
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
          {["fail", "warn", "unknown", "pass"].map((status) => {
            const group = findings.filter((f) => f.status === status);
            return group.length ? (
              <details key={status} open={status !== "pass"}>
                <summary>
                  {status === "fail"
                    ? "Needs attention"
                    : status === "warn"
                      ? "Worth improving"
                      : status === "unknown"
                        ? "Could not check"
                        : "Looking good"}
                </summary>
                {group.map((f) => (
                  <article className="am-finding" key={`${f.group ?? ""}:${f.title}:${f.fix}`}>
                    {f.group && <p className="am-eyebrow">{f.group}</p>}
                    <h4>{f.title}</h4>
                    {f.evidence && (
                      <p>
                        <b>Found:</b> {f.evidence}
                      </p>
                    )}
                    <span className={`am-status am-status-${f.status}`}>
                      {
                        {
                          unknown: "Unavailable",
                          pass: "Passing",
                          warn: "Improve",
                          fail: "Needs attention",
                        }[f.status]
                      }
                    </span>
                    <p>
                      <b>Why it matters:</b> {f.why}
                    </p>
                    {f.fix && (
                      <p>
                        <b>How to fix it:</b> {f.fix}
                      </p>
                    )}
                    {fix && status !== "pass" && (
                      <MarketingButton
                        onClick={() =>
                          void fix(
                            `Help me fix this on ${String(record(result.input).url ?? readBrand()?.website ?? "my website")}: ${f.title}\n${f.why}\n${f.fix}`,
                          ).catch((error: Error) => setError(error.message))
                        }
                      >
                        Fix this with AI
                      </MarketingButton>
                    )}
                  </article>
                ))}
              </details>
            ) : null;
          })}
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
              onClick={() =>
                void navigator.clipboard
                  .writeText(resultMarkdown(result))
                  .catch(() => setError("Could not copy. Try exporting instead."))
              }
            >
              <MarketingIcon name="copy" />
              Copy results
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
              Export Markdown
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

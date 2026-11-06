import { useState, type ReactNode } from "react";
import type { ToolResult } from "@amicited/tools-core";
export type Brand = { website: string; name: string };
export function readBrand(): Brand | null {
  try {
    return JSON.parse(localStorage.getItem("amicited.brand") ?? "null") as Brand | null;
  } catch {
    return null;
  }
}
export function saveBrand(brand: Brand) {
  localStorage.setItem("amicited.brand", JSON.stringify(brand));
}
export function normalizeWebsite(value: string): Brand {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname.includes("."))
    throw new Error("Enter a website like example.com.");
  return { website: url.origin, name: url.hostname.replace(/^www\./, "") };
}
export function AmICitedMark() {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg aria-hidden="true" width="30" height="30" viewBox="0 0 32 32">
        <rect width="32" height="32" rx="9" fill="#50d6bb" />
        <path d="M8 24 16 7l8 17h-5l-3-7-3 7Z" fill="#102d32" />
        <circle cx="24" cy="8" r="3" fill="white" />
      </svg>
      <strong>AmICited</strong>
    </span>
  );
}
export function FirstRun({
  subscriptions,
  prepare,
  check,
  skip,
  fix,
}: {
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
      <div className="am-page am-onboarding">
        <AmICitedMark />
        <MarketingResult result={result} fix={fix} retry={() => setResult(null)} />
        <button onClick={skip}>Go to Home →</button>
      </div>
    );
  return (
    <div className="am-page am-onboarding">
      <AmICitedMark />
      <p className="am-eyebrow">YOUR FIRST WIN STARTS HERE</p>
      <h1>What’s your website?</h1>
      <p>Find out what’s helping your visibility, and what to improve next.</p>
      {brand && (
        <p className="am-card">
          <b>{brand.name}</b> · {brand.website}{" "}
          <button className="am-text-button" onClick={() => setBrand(null)}>
            Edit
          </button>
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
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not get ready. Please try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Website URL
            <input
              required
              placeholder="https://your-website.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
          <label>
            Brand name <small>(optional)</small>
            <input
              placeholder="We’ll use your domain"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button disabled={busy}>
            {busy ? "Getting ready…" : brand ? "Update website" : "Continue"}
          </button>
        </form>
      )}
      {brand && (
        <section className="am-card">
          <h2>Your AI subscriptions</h2>
          <p>
            Use the AI plan you already pay for. Website checks also work without connecting AI.
          </p>
          {subscriptions}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                setResult(await check(brand));
                localStorage.setItem("amicited.onboarded", "true");
              } catch {
                setError("Could not check your website. Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Checking your website…" : "Run my free website check"}
          </button>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        <button className="am-text-button" onClick={skip}>
          Skip for now
        </button>
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
  return entries.map((item) => {
    const f = record(item);
    const status = String(f.status ?? f.severity ?? "warn");
    return {
      title: String(f.title ?? f.message ?? (typeof item === "string" ? item : "Finding")),
      status:
        status === "pass" || status === "success"
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
export function resultMarkdown(result: ToolResult) {
  return `# Website check\n\n${result.status === "error" ? (result.error?.message ?? "Could not check") : JSON.stringify(result.output, null, 2)}`;
}
export function ResultFooterSlot(_props: { result: ToolResult }) {
  return null;
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
  return (
    <section className="am-card" aria-label="Tool result">
      <p className="am-eyebrow">WEBSITE CHECK</p>
      <h2>{result.status === "error" ? "Could not check your website" : "Your results"}</h2>
      {result.status === "error" ? (
        <>
          <p>{result.error?.message ?? "The check could not finish. Try again."}</p>
          <button onClick={retry}>Try again</button>
        </>
      ) : (
        <>
          {(typeof output.score === "number" || typeof output.grade === "string") && (
            <strong className="am-score">
              {typeof output.score === "number"
                ? `${output.score}/100`
                : `Grade ${String(output.grade)}`}
            </strong>
          )}
          {["fail", "warn", "pass"].map((status) => {
            const group = findings.filter((f) => f.status === status);
            return group.length ? (
              <div key={status}>
                <h3>
                  {status === "fail"
                    ? "Needs attention"
                    : status === "warn"
                      ? "Worth improving"
                      : "Looking good"}
                </h3>
                {group.map((f) => (
                  <article className="am-finding" key={`${f.title}:${f.fix}`}>
                    <h4>{f.title}</h4>
                    <p>
                      <b>Why it matters:</b> {f.why}
                    </p>
                    <p>
                      <b>How to fix it:</b> {f.fix}
                    </p>
                    {fix && status !== "pass" && (
                      <button
                        onClick={() =>
                          void fix(
                            `Help me fix this finding for ${JSON.stringify(result.input)}: ${f.title}\n${f.why}\n${f.fix}`,
                          ).catch(() => setError("Could not start a task. Please try again."))
                        }
                      >
                        Fix this with AI
                      </button>
                    )}
                  </article>
                ))}
              </div>
            ) : null;
          })}
          {!findings.length && (
            <dl>
              {Object.entries(output).map(([key, value]) => (
                <div className="am-finding" key={key}>
                  <dt>{key.replace(/([A-Z])/g, " $1")}</dt>
                  <dd>
                    {typeof value === "object" ? (
                      <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(value, null, 2)}</pre>
                    ) : (
                      String(value)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="am-actions">
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(resultMarkdown(result))
                  .catch(() => setError("Could not copy. Try exporting instead."))
              }
            >
              Copy results
            </button>
            <button
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([resultMarkdown(result)], { type: "text/markdown" }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = "website-check.md";
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export Markdown
            </button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <ResultFooterSlot result={result} />
    </section>
  );
}

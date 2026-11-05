import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { ToolCard, ToolResult } from "@amicited/tools-core";

export const PRODUCT_NAME = "AmICited Desktop";
const MODE_KEY = "amicited.workspace-mode";
export function readWorkspaceMode(): "marketer" | "developer" {
  try {
    return localStorage.getItem(MODE_KEY) === "developer" ? "developer" : "marketer";
  } catch {
    return "marketer";
  }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("amicited-mode", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("amicited-mode", listener);
  };
}
export function useWorkspaceMode() {
  return useSyncExternalStore(subscribe, readWorkspaceMode, () => "marketer" as const);
}
export function setWorkspaceMode(mode: "marketer" | "developer") {
  localStorage.setItem(MODE_KEY, mode);
  window.dispatchEvent(new Event("amicited-mode"));
}
const destinations = [
  ["Home", "/home"],
  ["Tasks", "/tasks"],
  ["Tools", "/tools"],
  ["Settings", "/marketing-settings"],
] as const;
const style = {
  shell: {
    display: "flex",
    height: "100dvh",
    width: "100%",
    background: "#f8fafc",
    color: "#182a3a",
    fontFamily: "system-ui",
  },
  nav: { width: 238, flexShrink: 0, padding: 28, background: "#102d32", color: "#edfafa" },
  main: { flex: 1, minWidth: 0, overflow: "auto", padding: "60px 64px" },
  card: {
    background: "white",
    border: "1px solid #dce5e7",
    borderRadius: 16,
    padding: 28,
    marginTop: 20,
  },
  button: {
    border: 0,
    borderRadius: 8,
    padding: "12px 22px",
    background: "#126c64",
    color: "white",
    cursor: "pointer",
  },
  input: {
    display: "block",
    width: "100%",
    border: "1px solid #bdced1",
    borderRadius: 8,
    padding: 14,
    margin: "10px 0 20px",
    color: "#182a3a",
    background: "white",
  },
} as const;
export function MarketingShell({
  children,
  path,
  navigate,
}: {
  children: ReactNode;
  path: string;
  navigate: (path: string) => void;
}) {
  return (
    <div style={style.shell}>
      <aside style={style.nav}>
        <strong>{PRODUCT_NAME}</strong>
        <p style={{ opacity: 0.7, fontSize: 13 }}>Your marketing workspace</p>
        <nav aria-label="Main navigation" style={{ marginTop: 48 }}>
          {destinations.map(([label, href]) => (
            <a
              key={href}
              href={href}
              onClick={(event) => {
                event.preventDefault();
                navigate(href);
              }}
              style={{
                display: "block",
                color: "inherit",
                padding: "14px 12px",
                marginBottom: 8,
                borderRadius: 8,
                background: path === href ? "#245258" : "transparent",
                textDecoration: "none",
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <p style={{ marginTop: 100, fontSize: 13, opacity: 0.7 }}>
          Local tools. Your AI.
          <br />
          No account required.
        </p>
      </aside>
      <main style={style.main}>{children}</main>
    </div>
  );
}
export function Home({ startTask }: { startTask: (prompt: string) => Promise<void> }) {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <p>YOUR WORKSPACE</p>
      <h1 style={{ fontSize: 32, fontWeight: 650, margin: "16px 0" }}>What will you grow today?</h1>
      <p>Turn a marketing question into your next useful action.</p>
      <form
        style={style.card}
        onSubmit={(event) => {
          event.preventDefault();
          void startTask(prompt).catch(() =>
            setError("Could not start a task. Check your machine connection."),
          );
        }}
      >
        <label htmlFor="ask">Ask your AI assistant</label>
        <textarea
          id="ask"
          style={style.input}
          placeholder="Help me improve my website’s visibility…"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          required
        />
        <button style={style.button}>Start a task</button>
        <p role="alert">{error}</p>
      </form>
      <section style={style.card}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "20px 0 12px" }}>
          A quick win for your website
        </h2>
        <p>Check your SSL certificate with a free local tool.</p>
        <a href="/tools/seo.ssl.check">Check website security →</a>
      </section>
    </>
  );
}
export function ToolsGrid({ tools }: { tools: readonly ToolCard[] }) {
  return (
    <>
      <p>FREE LOCAL TOOLS</p>
      <h1 style={{ fontSize: 32, fontWeight: 650, margin: "16px 0" }}>Your marketing toolkit</h1>
      <p>Useful checks, clear results. No account needed.</p>
      {["seo", "ai-visibility", "content", "serp"].map((pack) => (
        <section key={pack}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: "20px 0 12px" }}>
            {
              {
                seo: "Site audit basics",
                "ai-visibility": "AI visibility",
                content: "Content tools",
                serp: "SERP & keywords",
              }[pack]
            }
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 20,
            }}
          >
            {tools
              .filter((tool) => tool.pack === pack)
              .map((tool) => (
                <a
                  style={{ ...style.card, color: "inherit", textDecoration: "none" }}
                  key={tool.name}
                  href={"/tools/" + tool.name}
                >
                  <small>FREE · RUNS LOCALLY</small>
                  <h3 style={{ fontSize: 18, fontWeight: 600, margin: "12px 0" }}>{tool.title}</h3>
                  <p>{tool.description}</p>
                  <span>Open tool →</span>
                </a>
              ))}
          </div>
          {!tools.some((tool) => tool.pack === pack) && <p>More tools coming soon.</p>}
        </section>
      ))}
    </>
  );
}
export function ToolForm({
  tool,
  run,
  disabled = false,
}: {
  tool: ToolCard;
  disabled?: boolean;
  run: (input: unknown) => Promise<ToolResult>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ToolResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const properties = (tool.inputSchema.properties ?? {}) as Record<
    string,
    { type?: string; title?: string; pattern?: string }
  >;
  const required = (tool.inputSchema.required ?? []) as string[];
  return (
    <>
      <a href="/tools">← All tools</a>
      <h1 style={{ fontSize: 32, fontWeight: 650, margin: "16px 0" }}>{tool.title}</h1>
      <p>{tool.description}</p>
      <form
        style={style.card}
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          const input = Object.fromEntries(
            Object.entries(properties).map(([key, schema]) => [
              key,
              schema.type === "number" || schema.type === "integer"
                ? Number(values[key])
                : schema.type === "boolean"
                  ? values[key] === "true"
                  : (values[key] ?? ""),
            ]),
          );
          void run(input)
            .then(setResult)
            .catch(() => setError("Could not reach the local tools service."))
            .finally(() => setBusy(false));
        }}
      >
        {Object.entries(properties).map(([key, schema]) => (
          <label key={key}>
            {schema.title ?? key}
            <input
              aria-label={key}
              style={style.input}
              type={schema.type === "number" || schema.type === "integer" ? "number" : "text"}
              pattern={schema.pattern}
              placeholder={key === "domain" ? "example.com" : ""}
              required={required.includes(key)}
              value={values[key] ?? ""}
              onChange={(event) => setValues({ ...values, [key]: event.target.value })}
            />
          </label>
        ))}
        <button style={style.button} disabled={busy || disabled}>
          {busy ? "Checking…" : "Run check"}
        </button>
        <p role="alert">{error}</p>
      </form>
      {result && (
        <section aria-label="Tool result" style={style.card}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: "20px 0 12px" }}>
            {result.status === "success" ? "Your results" : "Check could not finish"}
          </h2>
          {result.error ? (
            <p>{result.error.message}</p>
          ) : (
            <dl>
              {Object.entries(result.output as Record<string, unknown>).map(([key, value]) => (
                <div key={key} style={{ marginBottom: 14 }}>
                  <dt style={{ fontWeight: 600 }}>{key}</dt>
                  <dd>
                    {Array.isArray(value) ? value.join(", ") || "No issues found" : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <small>
            Run {result.id} · {result.durationMs} ms
          </small>
        </section>
      )}
    </>
  );
}
export function MarketingSettings() {
  return (
    <>
      <h1 style={{ fontSize: 32, fontWeight: 650, margin: "16px 0" }}>Settings</h1>
      <section style={style.card}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: "20px 0 12px" }}>Workspace mode</h2>
        <p>
          Marketer mode keeps your marketing work front and center. Developer mode includes source
          control, terminals and advanced settings.
        </p>
        <label>
          Workspace mode
          <select
            aria-label="Workspace mode"
            style={style.input}
            value={readWorkspaceMode()}
            onChange={(event) => {
              setWorkspaceMode(event.target.value === "developer" ? "developer" : "marketer");
              window.location.assign("/settings/general");
            }}
          >
            <option value="marketer">Marketer</option>
            <option value="developer">Developer</option>
          </select>
        </label>
      </section>
      <p>Local tools are free and work without an AmICited account.</p>
    </>
  );
}

export function WorkspaceModeControl() {
  const mode = useWorkspaceMode();
  return (
    <label>
      Workspace mode{" "}
      <select
        aria-label="Workspace mode"
        value={mode}
        onChange={(event) => {
          setWorkspaceMode(event.target.value === "developer" ? "developer" : "marketer");
          window.location.assign("/home");
        }}
      >
        <option value="marketer">Marketer</option>
        <option value="developer">Developer</option>
      </select>
    </label>
  );
}

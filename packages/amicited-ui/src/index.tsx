import "./marketing.css";
import {
  AmICitedMark,
  readBrand,
  saveBrand,
  normalizeWebsite,
  MarketingResult,
} from "./experience.js";
export * from "./experience.js";
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
  ["Settings", "/settings/general"],
  ["AmICited", "/marketing-settings"],
] as const;
const style = {
  nav: { width: 238, flexShrink: 0, padding: 28, background: "#102d32", color: "#edfafa" },
  card: {
    background: "var(--card, white)",
    border: "1px solid var(--border, #dce5e7)",
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
    color: "var(--foreground, #182a3a)",
    background: "var(--card, white)",
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
    <div className="am-shell">
      <aside style={style.nav}>
        <AmICitedMark />
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
      <main className="am-main">{children}</main>
    </div>
  );
}
export function Home({
  startTask,
  subscriptions,
  recent,
  cloud,
}: {
  startTask: (prompt: string) => Promise<void>;
  subscriptions?: ReactNode;
  recent?: ReactNode;
  cloud?: ReactNode;
}) {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <p className="am-eyebrow">{readBrand()?.name ?? "YOUR WORKSPACE"}</p>
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
          placeholder="What do you want to get done?"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          required
        />
        <button style={style.button}>Start a task</button>
        <p role="alert">{error}</p>
      </form>
      <section className="am-card">
        <h2>Your next useful action</h2>
        <div className="am-quick">
          {[
            ["Check my AI visibility", "/tools#ai-visibility"],
            ["Audit my website", "/tools/seo.site.audit"],
            ["Research keywords", "/tools#serp"],
            ["Write or repurpose content", "/tools#content"],
          ].map(([label, href]) => (
            <a key={label} href={href}>
              {label} →
            </a>
          ))}
        </div>
      </section>
      <section className="am-card" id="ai-subscriptions">
        <h2>Your AI subscriptions</h2>
        {subscriptions}
      </section>
      {cloud}
      <section className="am-card">
        <h2>Recent results</h2>
        {recent ?? <p>Your completed checks will appear here.</p>}
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
        <section key={pack} id={pack}>
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
  fix,
  onResult,
}: {
  tool: ToolCard;
  fix?: (prompt: string) => Promise<void>;
  onResult?: (result: ToolResult) => void;
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
            Object.entries(properties)
              .filter(([key]) => required.includes(key) || Boolean(values[key]?.trim()))
              .map(([key, schema]) => [
                key,
                schema.type === "array"
                  ? (values[key] ?? "")
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean)
                  : schema.type === "number" || schema.type === "integer"
                    ? Number(values[key])
                    : schema.type === "boolean"
                      ? values[key] === "true"
                      : (values[key] ?? ""),
              ]),
          );
          void run(input)
            .then((value) => {
              setResult(value);
              onResult?.(value);
            })
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
      {result && <MarketingResult result={result} fix={fix} retry={() => setResult(null)} />}
    </>
  );
}
export function MarketingSettings({ connection }: { connection?: ReactNode }) {
  const [website, setWebsite] = useState(readBrand()?.website ?? "");
  const [name, setName] = useState(readBrand()?.name ?? "");
  const [message, setMessage] = useState("");
  return (
    <div className="am-page">
      <h1>Settings</h1>
      {connection}
      <section className="am-card">
        <h2>Your website / brand</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const brand = normalizeWebsite(website);
              saveBrand({ ...brand, name: name.trim() || brand.name });
              setMessage("Saved");
            } catch {
              setMessage("Enter a website like example.com.");
            }
          }}
        >
          <label>
            Website URL
            <input value={website} onChange={(e) => setWebsite(e.target.value)} required />
          </label>
          <label>
            Brand name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button>Save</button>
          <p role="status">{message}</p>
        </form>
      </section>

      <section className="am-card">
        <WorkspaceModeControl />
      </section>
    </div>
  );
}
export function WorkspaceModeControl() {
  const mode = useWorkspaceMode();
  return (
    <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <input
        type="checkbox"
        role="switch"
        aria-label="Developer features"
        checked={mode === "developer"}
        onChange={(e) => {
          setWorkspaceMode(e.target.checked ? "developer" : "marketer");
          window.location.assign("/settings/general");
        }}
      />
      Developer features
    </label>
  );
}

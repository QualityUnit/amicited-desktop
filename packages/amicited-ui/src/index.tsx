import { MarketingButton, MarketingInput, MarketingTextarea, SectionHead } from "./primitives.js";
import {
  initialFields,
  resolveField,
  serializeFields,
  fieldLabels,
  type FieldSchema,
} from "./fields.js";
import "./marketing.css";
import {
  AmICitedMark,
  readBrand,
  saveBrand,
  normalizeWebsite,
  MarketingResult,
  marketingNavigate,
  MarketingLink,
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
export function MarketingShell({
  children,
  path,
  navigate,
  taskView = false,
  mode = "marketer",
}: {
  children: ReactNode;
  path: string;
  navigate: (path: string) => void;
  taskView?: boolean;
  mode?: "marketer" | "developer";
}) {
  if (mode === "developer") return children;
  return (
    <div data-amicited-shell="" className="am-shell">
      <aside className="am-rail">
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
              className="am-nav-row"
              aria-current={
                path === href || (href === "/tools" && path.startsWith("/tools/"))
                  ? "page"
                  : undefined
              }
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
      <main
        className={taskView ? "am-main am-task" : "am-main"}
        onClick={(event) => {
          if (event.defaultPrevented) return;
          const link = (event.target as HTMLElement).closest("a");
          if (link?.getAttribute("href")?.startsWith("/") && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            navigate(link.getAttribute("href")!);
          }
        }}
      >
        {children}
      </main>
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
      <h1>What will you grow today?</h1>
      <p>Turn a marketing question into your next useful action.</p>
      <form
        className="am-card"
        onSubmit={(event) => {
          event.preventDefault();
          void startTask(prompt).catch(() =>
            setError("Could not start a task. Check your machine connection."),
          );
        }}
      >
        <label htmlFor="ask">Ask your AI assistant</label>
        <MarketingTextarea
          id="ask"

          placeholder="What do you want to get done?"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          required
        />
        <MarketingButton variant="default">Send task</MarketingButton>
        <p>Your selected assistant will start working on this request.</p>
        <p role="alert">{error}</p>
      </form>
      <section className="am-card">
        <SectionHead title="Your next useful action" />
        <div className="am-quick">
          {[
            ["Check my AI visibility", "/tools#ai-visibility"],
            ["Audit my website", "/tools/seo.site.audit"],
            ["Research keywords", "/tools#serp"],
            ["Write or repurpose content", "/tools#content"],
          ].map(([label, href]) => (
            <MarketingLink key={label} href={href}>
              {label} →
            </MarketingLink>
          ))}
        </div>
      </section>
      <section className="am-card" id="ai-subscriptions">
        <SectionHead title="Your AI subscriptions" />
        {subscriptions}
      </section>
      {cloud}
      <section className="am-card">
        <SectionHead title="Recent results" />
        {recent ?? <p>Your completed checks will appear here.</p>}
      </section>
    </>
  );
}
export function ToolsGrid({ tools }: { tools: readonly ToolCard[] }) {
  return (
    <>
      <p className="am-eyebrow">FREE · RUNS LOCALLY</p>
      <h1>Your marketing toolkit</h1>
      <p>Useful checks, clear results. No account needed.</p>
      {["seo", "ai-visibility", "content", "serp"].map((pack) => (
        <section key={pack} id={pack}>
          <h2 className="am-pack-title">
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
              gap: 16,
            }}
          >
            {tools
              .filter((tool) => tool.pack === pack)
              .map((tool) => (
                <MarketingLink
                  className="am-card am-tool-card"
                  key={tool.name}
                  href={"/tools/" + tool.name}
                >
                  <span className="am-status am-status-neutral">Free local tool</span>
                  <h3>{tool.title}</h3>
                  <p>{tool.description}</p>
                  <span>Open tool →</span>
                </MarketingLink>
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
  const [values, setValues] = useState<Record<string, string>>(() => initialFields(tool));
  const [result, setResult] = useState<ToolResult | null>(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("amicited.last-result") ?? "null",
      ) as ToolResult | null;
      return saved?.tool === tool.name ? saved : null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const properties = (tool.inputSchema.properties ?? {}) as Record<string, FieldSchema>;
  const required = (tool.inputSchema.required ?? []) as string[];
  return (
    <>
      <a
        href="/tools"
        onClick={(e) => {
          e.preventDefault();
          marketingNavigate("/tools");
        }}
      >
        ← All tools
      </a>
      <h1>{tool.title}</h1>
      <p>{tool.description}</p>
      <form
        className="am-card"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          sessionStorage.setItem("amicited.inputs." + tool.name, JSON.stringify(values));
          const input = serializeFields(properties, required, values);
          void run(input)
            .then((value) => {
              setResult(value);
              onResult?.(value);
            })
            .catch(() => setError("Could not reach the local tools service."))
            .finally(() => setBusy(false));
        }}
      >
        {Object.entries(properties).map(([key, raw]) => {
          const schema = resolveField(raw);
          const label = schema.title ?? fieldLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
          const props = {
            "aria-label": key,
            required: required.includes(key),
            value: values[key] ?? "",
            onChange: (event: { target: { value: string } }) =>
              setValues({ ...values, [key]: event.target.value }),
          };
          return (
            <label key={key}>
              {label}
              {schema.description && <small>{schema.description}</small>}
              {schema.type === "boolean" ? (
                <select {...props}>
                  <option value="">Use default</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : ["text", "brief", "source", "instructions"].some((name) =>
                  key.toLowerCase().includes(name),
                ) ? (
                <MarketingTextarea {...props} rows={6} />
              ) : (
                <MarketingInput
                  {...props}

                  type={["number", "integer"].includes(schema.type ?? "") ? "number" : "text"}
                  pattern={schema.pattern}
                  placeholder={
                    schema.type === "array"
                      ? "Example: Acme, Contoso"
                      : key === "category"
                        ? "Example: email marketing software"
                        : key === "market"
                          ? "Example: small businesses in the UK"
                          : key === "domain"
                            ? "example.com"
                            : ""
                  }
                />
              )}
            </label>
          );
        })}
        <MarketingButton variant="default" disabled={busy || disabled}>
          {busy
            ? "Working…"
            : tool.name.startsWith("content.") && tool.name !== "content.readability"
              ? "Generate draft"
              : "Run check"}
        </MarketingButton>
        <p role="alert">{error}</p>
      </form>
      {result && <MarketingResult result={result} fix={fix} retry={() => setResult(null)} />}
    </>
  );
}
export function MarketingSettings({
  connection,
  modeControl,
}: {
  connection?: ReactNode;
  modeControl?: (checked: boolean, onChange: (checked: boolean) => void) => ReactNode;
}) {
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
            <MarketingInput value={website} onChange={(e) => setWebsite(e.target.value)} required />
          </label>
          <label>
            Brand name
            <MarketingInput value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <MarketingButton variant="default">Save</MarketingButton>
          <p role="status">{message}</p>
        </form>
      </section>

      <section className="am-card">
        <WorkspaceModeControl control={modeControl} />
      </section>
    </div>
  );
}
export function WorkspaceModeControl({
  control,
}: {
  control?: ((checked: boolean, onChange: (checked: boolean) => void) => ReactNode) | undefined;
} = {}) {
  const mode = useWorkspaceMode();
  return (
    <label style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {control ? (
        control(mode === "developer", (checked) =>
          setWorkspaceMode(checked ? "developer" : "marketer"),
        )
      ) : (
        <MarketingInput
          type="checkbox"
          role="switch"
          aria-label="Developer features"
          checked={mode === "developer"}
          onChange={(e) => {
            setWorkspaceMode(e.target.checked ? "developer" : "marketer");
          }}
        />
      )}
      <span>
        Developer features
        <small style={{ display: "block" }}>Show coding tools and advanced settings.</small>
      </span>
    </label>
  );
}

export {
  MarketingUiContext,
  MarketingButton,
  MarketingInput,
  MarketingTextarea,
  KpiTile,
  SectionHead,
} from "./primitives.js";

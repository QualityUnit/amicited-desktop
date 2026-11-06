import {
  MarketingButton,
  MarketingInput,
  MarketingTextarea,
  SectionHead,
  MarketingIcon,
  toolIcon,
  MarketingTitle,
} from "./primitives.js";
import {
  initialFields,
  resolveField,
  serializeFields,
  fieldLabels,
  type FieldSchema,
} from "./fields.js";
import "./marketing.css";
import {
  readBrand,
  saveBrand,
  normalizeWebsite,
  MarketingResult,
  marketingNavigate,
  MarketingLink,
} from "./experience.js";
export * from "./experience.js";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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
export { MarketingShell } from "./shell.js";
export function Home({
  startTask,
  assistantName,
  assistantsLoading = false,
  subscriptions,
  recent,
  cloud,
}: {
  startTask: (prompt: string) => Promise<void>;
  assistantName?: string | undefined;
  assistantsLoading?: boolean;
  subscriptions?: ReactNode;
  recent?: ReactNode;
  cloud?: ReactNode;
}) {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const visibleError =
    assistantName && error === "Connect Claude or ChatGPT to send this task" ? "" : error;
  return (
    <>
      <form
        className="am-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (assistantsLoading) return;
          if (!assistantName) {
            setError("Connect Claude or ChatGPT to send this task");
            document.getElementById("ai-subscriptions")?.scrollIntoView({ block: "center" });
            return;
          }
          setError("");
          void startTask(prompt).catch((error: Error) => setError(error.message));
        }}
      >
        <SectionHead title="What will you grow today?" />
        <label htmlFor="ask">Ask your AI assistant</label>
        <MarketingTextarea
          id="ask"

          placeholder="What do you want to get done?"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          required
        />
        <MarketingButton variant="default" disabled={assistantsLoading}>
          <MarketingIcon name="send" />
          Send task
        </MarketingButton>
        {!assistantsLoading && !visibleError && (
          <p>
            {assistantName
              ? `${assistantName} will start working on this`
              : "Connect an assistant first"}
          </p>
        )}
        <p role="alert" className={visibleError ? "am-status am-status-warn" : undefined}>
          {visibleError}
        </p>
      </form>
      <div className="am-home-grid">
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
                <MarketingIcon
                  name={
                    href?.includes("seo")
                      ? "seo"
                      : href?.includes("visibility")
                        ? "ai-visibility"
                        : href?.includes("serp")
                          ? "serp"
                          : "content"
                  }
                />
                <span>{label}</span>
                <MarketingIcon name="arrow" />
              </MarketingLink>
            ))}
          </div>
        </section>
        <section className="am-card" id="ai-subscriptions">
          <SectionHead title="Your AI subscriptions" />
          {subscriptions}
        </section>
      </div>
      <section className="am-card">
        <SectionHead title="Recent results" />
        {cloud}
        {recent ?? <p>Your completed checks will appear here.</p>}
      </section>
    </>
  );
}
const packs = [
  ["seo", "Site audit basics"],
  ["ai-visibility", "AI visibility"],
  ["content", "Content tools"],
  ["serp", "SERP & keywords"],
] as const;
export function ToolsGrid({ tools }: { tools: readonly ToolCard[] }) {
  const [selected, setSelected] = useState(() => window.location.hash.slice(1) || "seo");
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep pack selection synchronized with incoming tool links and browser history.
  useEffect(() => {
    const update = () => setSelected(window.location.hash.slice(1) || "seo");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return (
    <>
      <nav className="am-pack-tabs" aria-label="Tool categories">
        {packs.map(([pack, label]) => (
          <a
            key={pack}
            href={"#" + pack}
            aria-current={selected === pack ? "page" : undefined}
            onClick={() => setSelected(pack)}
          >
            <MarketingIcon name={pack} />
            {label}
          </a>
        ))}
      </nav>
      <p className="am-hint">Free local tools. Useful checks, clear results. No account needed.</p>
      <div className="am-tool-grid">
        {tools
          .filter((tool) => tool.pack === selected)
          .map((tool) => (
            <MarketingLink
              className="am-card am-tool-card"
              key={tool.name}
              href={"/tools/" + tool.name}
            >
              <div className="am-tool-head">
                <MarketingIcon name={toolIcon(tool.name)} />
                <h3>{tool.title}</h3>
                <span>Open →</span>
              </div>
              <p>{tool.description}</p>
            </MarketingLink>
          ))}
      </div>
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
      <MarketingTitle>{tool.title}</MarketingTitle>
      {!result && (
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
          <h2>{tool.title}</h2>
          <p>{tool.description}</p>
          <form
            className="am-card"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                sessionStorage.setItem("amicited.inputs." + tool.name, JSON.stringify(values));
              } catch {
                /* Inputs remain in the form if storage is blocked. */
              }
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
              const label =
                schema.title ?? fieldLabels[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
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
                : ["content.write", "content.repurpose"].includes(tool.name)
                  ? "Generate draft"
                  : "Run check"}
            </MarketingButton>
            <p role="alert">{error}</p>
          </form>
        </>
      )}
      {result && <MarketingResult result={result} fix={fix} retry={() => setResult(null)} />}
    </>
  );
}
export function MarketingSettings({
  connection: _connection,
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
      <section className="am-card" id="website">
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

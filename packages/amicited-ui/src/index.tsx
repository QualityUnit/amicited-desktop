import { CompactMarketingResult } from "./chat.js";
import { Card } from "./cloud/Card.js";
import { packs } from "./packs.js";
import {
  MarketingButton,
  MarketingInput,
  MarketingTextarea,
  MarketingIcon,
  toolIcon,
  MarketingSettingsGroup,
  MarketingSettingsRow,
  MarketingUiContext,
} from "./primitives.js";
import {
  initialFields,
  fieldsFromInput,
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
  resultQuestion,
} from "./experience.js";
export * from "./experience.js";
import { useContext, useState, useSyncExternalStore, type ReactNode } from "react";
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
export function ToolsGrid({
  tools,
  selectedPack = "seo",
  navigate,
}: {
  tools: readonly ToolCard[];
  selectedPack?: string;
  navigate: (path: string) => void;
}) {
  const activePack = selectedPack;
  const { Categories } = useContext(MarketingUiContext);
  return (
    <>
      {Categories ? (
        <Categories
          value={activePack}
          items={packs}
          onChange={(pack) => navigate("/tools?category=" + pack)}
        />
      ) : (
        <nav className="am-pack-tabs" aria-label="Tool categories">
          {packs.map(([pack, label]) => (
            <a
              key={pack}
              href={"/tools?category=" + pack}
              className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
              aria-current={activePack === pack ? "page" : undefined}
              onClick={(event) => {
                event.preventDefault();
                navigate("/tools?category=" + pack);
              }}
            >
              <MarketingIcon name={pack} />
              {label}
            </a>
          ))}
        </nav>
      )}
      <p className="am-hint">Free local tools. Useful checks, clear results. No account needed.</p>
      <div className="am-tool-frame">
        <MarketingSettingsGroup className="am-tool-list">
          {tools
            .filter((tool) => tool.pack === activePack)
            .map((tool) => (
              <a
                key={tool.name}
                href={"/tools/" + tool.name}
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/tools/" + tool.name);
                }}
              >
                <MarketingSettingsRow
                  title={
                    <span className="flex items-center gap-3">
                      <MarketingIcon name={toolIcon(tool.name)} />
                      {tool.title}
                    </span>
                  }
                  description={tool.description}
                  control={<MarketingIcon name="right" />}
                />
              </a>
            ))}
        </MarketingSettingsGroup>
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
  fullResult = false,
}: {
  tool: ToolCard;
  fullResult?: boolean;
  fix?: (prompt: string, result: ToolResult) => Promise<void>;
  onResult?: (result: ToolResult) => void;
  disabled?: boolean;
  run: (input: unknown) => Promise<ToolResult>;
}) {
  const [expanded, setExpanded] = useState(fullResult);
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
      {!result && (
        <>
          <form
            className="am-tool-form overflow-clip rounded-xl border border-ai-line bg-ai-surf p-5 max-sm:p-4 max-sm:[--tv2-edge:16px] am-card"
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
            <p>{tool.description}</p>
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
                  ) : ["text", "brief", "source", "instructions", "voice"].some((name) =>
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
      {result && !expanded && (
        <>
          <CompactMarketingResult result={result} open={() => setExpanded(true)} />
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
            onClick={() => {
              setValues(fieldsFromInput(result.input));
              setResult(null);
            }}
          >
            Edit inputs
          </MarketingButton>
          {error && <p role="alert">{error}</p>}
        </>
      )}
      {result && expanded && (
        <MarketingResult
          title={tool.title}
          result={result}
          fix={fix}
          retry={() => {
            setValues(fieldsFromInput(result.input));
            setResult(null);
          }}
          rerun={async () => {
            const next = await run(result.input);
            setResult(next);
            onResult?.(next);
          }}
        />
      )}
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
      <Card className="am-card" id="website">
        <h2>Your website / brand</h2>
        <MarketingSettingsGroup>
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
            <MarketingSettingsRow
              title="Website URL"
              description="The website used for your local checks."
              control={
                <MarketingInput
                  aria-label="Website URL"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  required
                />
              }
            />
            <MarketingSettingsRow
              title="Brand name"
              control={
                <MarketingInput
                  aria-label="Brand name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              }
            />
            <div className="flex items-center justify-between gap-3 p-4">
              <p role="status" className="text-xs text-muted-foreground">
                {message}
              </p>
              <MarketingButton size="xs" variant="default">
                Save
              </MarketingButton>
            </div>
          </form>
        </MarketingSettingsGroup>
      </Card>

      <Card className="am-card">
        <h2>Workspace</h2>
        <MarketingSettingsGroup>
          <WorkspaceModeControl control={modeControl} />
        </MarketingSettingsGroup>
      </Card>
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
    <MarketingSettingsRow
      title="Developer features"
      description="Show coding tools and advanced settings."
      control={
        control ? (
          control(mode === "developer", (checked) =>
            setWorkspaceMode(checked ? "developer" : "marketer"),
          )
        ) : (
          <MarketingInput
            type="checkbox"
            role="switch"
            aria-label="Developer features"
            checked={mode === "developer"}
            onChange={(e) => setWorkspaceMode(e.target.checked ? "developer" : "marketer")}
          />
        )
      }
    />
  );
}

export {
  MarketingUiContext,
  MarketingButton,
  MarketingInput,
  MarketingTextarea,
  SectionHead,
  MarketingIcon,
  toolIcon,
} from "./primitives.js";

export {
  marketingSignInError,
  marketingErrorText,
  marketingStarters,
  marketingToolResult,
  marketingOfferResult,
  MarketingCallState,
  CompactMarketingResult,
} from "./chat.js";

export { MarketingHeader } from "./shell.js";

export { cloudRunId, cloudToolResult, CloudToolResultCard } from "./chat.js";

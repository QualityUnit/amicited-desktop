import { Card } from "./cloud/Card.js";
import {
  MarketingButton,
  MarketingInput,
  MarketingSettingsGroup,
  MarketingSettingsRow,
} from "./primitives.js";
import "./marketing.css";
import { readBrand, saveBrand, normalizeWebsite } from "./experience.js";
export * from "./experience.js";
import { useState, useSyncExternalStore, type ReactNode } from "react";

export const PRODUCT_NAME = "AmICited Desktop";
export { readWorkspaceMode } from "./mode.ts";
import { readWorkspaceMode, MODE_KEY } from "./mode.ts";
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
export function MarketingSettings({
  connection: _connection,
  modeControl,
  domains,
}: {
  domains?: ReactNode;
  connection?: ReactNode;
  modeControl?: (checked: boolean, onChange: (checked: boolean) => void) => ReactNode;
}) {
  const [website, setWebsite] = useState(readBrand()?.website ?? "");
  const [name, setName] = useState(readBrand()?.name ?? "");
  const [message, setMessage] = useState("");
  return (
    <div className="am-page">
      {domains ?? (
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
      )}

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

export { marketerLabel, marketerMenuItems } from "./menu.js";
export { MarketingThreadLocation } from "./threadDetails.js";

export { CmsGrid } from "./CmsGrid.js";

export { ReportPage, ReportViewer, groupReports } from "./reports.js";

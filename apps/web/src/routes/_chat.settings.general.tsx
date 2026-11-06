import { Switch } from "../components/ui/switch";
import { WorkspaceModeControl } from "@amicited/ui-marketing";
import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettingsPanel } from "../components/settings/SettingsPanels";

const renderModeSwitch = (checked: boolean, onCheckedChange: (checked: boolean) => void) => (
  <Switch aria-label="Developer features" checked={checked} onCheckedChange={onCheckedChange} />
);
function SettingsGeneralRoute() {
  return (
    <>
      <WorkspaceModeControl control={renderModeSwitch} />
      <GeneralSettingsPanel />
    </>
  );
}

export const Route = createFileRoute("/_chat/settings/general")({
  component: SettingsGeneralRoute,
});

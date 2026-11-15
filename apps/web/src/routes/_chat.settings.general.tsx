import { WorkspaceModeControl } from "@amicited/ui-marketing";
import { Switch } from "../components/ui/switch";

import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettingsPanel } from "../components/settings/SettingsPanels";

const renderModeSwitch = (checked: boolean, onCheckedChange: (checked: boolean) => void) => (
  <Switch aria-label="Developer features" checked={checked} onCheckedChange={onCheckedChange} />
);
function SettingsGeneralRoute() {
  return (
    <>
      <GeneralSettingsPanel
        workspaceModeControl={<WorkspaceModeControl control={renderModeSwitch} />}
      />
    </>
  );
}

export const Route = createFileRoute("/_chat/settings/general")({
  component: SettingsGeneralRoute,
});

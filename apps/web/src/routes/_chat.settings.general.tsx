import { WorkspaceModeControl } from "@amicited/ui-marketing";
import { createFileRoute } from "@tanstack/react-router";

import { GeneralSettingsPanel } from "../components/settings/SettingsPanels";

function SettingsGeneralRoute() {
  return (
    <>
      <WorkspaceModeControl />
      <GeneralSettingsPanel />
    </>
  );
}

export const Route = createFileRoute("/_chat/settings/general")({
  component: SettingsGeneralRoute,
});

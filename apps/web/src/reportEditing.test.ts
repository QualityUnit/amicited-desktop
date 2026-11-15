import { expect, it } from "vite-plus/test";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useRightPanelStore } from "./rightPanelStore";
import { revealReportPreview } from "./reportEditing";

it("reveals the returned browser on a new editing thread and preserves its other browser tabs", () => {
  useRightPanelStore.setState(useRightPanelStore.getInitialState());
  const ref = scopeThreadRef(EnvironmentId.make("reports-env"), ThreadId.make("new-report-thread"));
  revealReportPreview(ref, "first");
  expect(useRightPanelStore.getState().byThreadKey[scopedThreadKey(ref)]).toMatchObject({
    isOpen: true,
    activeSurfaceId: "browser:first",
  });
  revealReportPreview(ref, "second");
  const state = useRightPanelStore.getState().byThreadKey[scopedThreadKey(ref)];
  expect(state?.surfaces.map((surface) => surface.id)).toEqual(["browser:first", "browser:second"]);
  expect(state?.activeSurfaceId).toBe("browser:second");
  revealReportPreview(ref, null);
  expect(useRightPanelStore.getState().byThreadKey[scopedThreadKey(ref)]).toBe(state);
});

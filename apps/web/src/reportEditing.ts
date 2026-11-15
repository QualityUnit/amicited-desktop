import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useRightPanelStore } from "./rightPanelStore";

export function revealReportPreview(threadRef: ScopedThreadRef, tabId: string | null) {
  if (!tabId) return;
  const store = useRightPanelStore.getState();
  const tabs =
    store.byThreadKey[scopedThreadKey(threadRef)]?.surfaces.flatMap((surface) =>
      surface.kind === "preview" && surface.resourceId ? [surface.resourceId] : [],
    ) ?? [];
  store.reconcileBrowserSurfaces(threadRef, [...new Set([...tabs, tabId])]);
  store.revealSurface(threadRef, `browser:${tabId}`);
}

export const MODE_KEY = "amicited.workspace-mode";
export function readWorkspaceMode(): "marketer" | "developer" {
  try {
    return localStorage.getItem(MODE_KEY) === "developer" ? "developer" : "marketer";
  } catch {
    return "marketer";
  }
}

export { marketerMenuItems } from "./menu.js";

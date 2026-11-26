import { isElectron } from "../env";

// Full-screen setup pages have no header, so the frameless desktop window needs its own handle.
export function WindowDragStrip() {
  return isElectron ? (
    <div aria-hidden="true" className="drag-region" data-am="am-window-drag" />
  ) : null;
}

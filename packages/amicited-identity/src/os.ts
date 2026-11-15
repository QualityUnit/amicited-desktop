/**
 * OS-integration identities (rebrand/os-identity). Each value is AmICited's own, so a
 * real T3 Code install on the same machine keeps its desktop entry, D-Bus names and files.
 */
import { LINUX_DESKTOP_ENTRY_ID, PRODUCT_SHORT_NAME, SUPPORT_EMAIL } from "./index.ts";

/** Linux desktop entry (and Wayland app id) of development builds. */
export const LINUX_DESKTOP_ENTRY_ID_DEV = `${LINUX_DESKTOP_ENTRY_ID}.dev`;
/** Directory under `$XDG_DATA_HOME` that holds the screen capture helpers. */
export const XDG_DATA_DIR_NAME = "amicited";
/** Debian package maintainer. */
export const LINUX_MAINTAINER = `${PRODUCT_SHORT_NAME} <${SUPPORT_EMAIL}>`;

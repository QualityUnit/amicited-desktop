/**
 * The mobile app's identity, owned by the mobile rebrand. Every variant's ID extends
 * MOBILE_APP_ID, and App Group, widget and share-extension IDs extend the variant's ID
 * (for example `group.com.amicited.desktop.mobile.dev`).
 */
import {
  PRODUCT_SHORT_NAME,
  PROTOCOL_SCHEME,
  PROTOCOL_SCHEME_DEV,
  PROTOCOL_SCHEME_PREVIEW,
} from "./index.ts";

export const MOBILE_APP_NAME = PRODUCT_SHORT_NAME;
export const MOBILE_APP_NAME_DEV = `${PRODUCT_SHORT_NAME} Dev`;
export const MOBILE_APP_NAME_PREVIEW = `${PRODUCT_SHORT_NAME} Preview`;
export const MOBILE_APP_ID = "com.amicited.desktop.mobile";
export const MOBILE_APP_ID_DEV = `${MOBILE_APP_ID}.dev`;
export const MOBILE_APP_ID_PREVIEW = `${MOBILE_APP_ID}.preview`;
/** Every scheme a mobile variant registers; the first is production's. */
export const MOBILE_SCHEMES = [
  PROTOCOL_SCHEME,
  PROTOCOL_SCHEME_DEV,
  PROTOCOL_SCHEME_PREVIEW,
] as const;
/** Shown to the desktop in its paired-device list. */
export const MOBILE_CLIENT_LABEL = `${PRODUCT_SHORT_NAME} Mobile`;
/** The Expo project slug. EAS ties it to the project ID, so a build overrides it with AMICITED_EAS_SLUG. */
export const MOBILE_EXPO_SLUG = "amicited-mobile";

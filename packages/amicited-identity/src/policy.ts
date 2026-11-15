/**
 * Where administrators deploy AmICited's managed policy. These differ from T3 Code's, so a
 * T3 Code enterprise policy never applies to AmICited.
 */
import { APP_ID, PRODUCT_NAME, PRODUCT_SHORT_NAME, PUBLISHER_NAME, SERVICE_NAME } from "./index.ts";

export const POLICY_FILE_PATH_DARWIN = `/Library/Application Support/${PRODUCT_SHORT_NAME}/policy.json`;
export const POLICY_FILE_PATH_WIN32 = `C:\\Program Files\\${PRODUCT_SHORT_NAME}\\policy.json`;
export const POLICY_FILE_PATH_LINUX = `/etc/${SERVICE_NAME}/policy.json`;

/** The managed-preferences domain; a configuration profile's PayloadType must match it. */
export const POLICY_PREFERENCES_DOMAIN = APP_ID;
export const POLICY_REGISTRY_SUBKEY = `SOFTWARE\\Policies\\${PUBLISHER_NAME}\\${PRODUCT_SHORT_NAME}`;

export const POLICY_ADMX_NAMESPACE = `${PUBLISHER_NAME}.Policies.${PRODUCT_SHORT_NAME}`;
export const POLICY_ADMX_PREFIX = SERVICE_NAME;
export const POLICY_ADMX_CATEGORY = PRODUCT_SHORT_NAME;
export const POLICY_ADMX_CATEGORY_NAME = PRODUCT_NAME;
export const POLICY_TEMPLATE_BASENAME = SERVICE_NAME;

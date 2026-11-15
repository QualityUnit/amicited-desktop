import { WEBSITE_URL } from "./index.ts";

/** The checked-in project file at a repository root. The app reads it first. */
export const PROJECT_FILE_NAME = "amicited.json";
/** Upstream T3 Code's project file, still read when a checkout has no amicited.json. */
export const LEGACY_PROJECT_FILE_NAME = "t3.json";
/** Served by apps/marketing; the project file's `$schema` points here. */
export const PROJECT_FILE_SCHEMA_URL = `${WEBSITE_URL}/schema/${PROJECT_FILE_NAME}`;

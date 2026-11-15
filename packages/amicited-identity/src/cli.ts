/**
 * The `amicited` CLI's release identity: where its builds come from and how it is published.
 * Owned by the CLI and releases rebrand; `index.ts` stays identical across branches.
 */

// TODO(amicited-infra): npm package name + trusted publisher
// (https://github.com/QualityUnit/amicited-desktop/issues/17). Nobody has claimed `amicited` on
// npm for us yet; if it is taken, publish under a scope and update this constant.
export const NPM_PACKAGE_NAME = "amicited";

/** Overrides the GitHub releases download base, for a mirror. Replaces T3CODE_RELEASE_BASE_URL. */
export const RELEASE_BASE_URL_ENV_VAR = "AMICITED_RELEASE_BASE_URL";

/**
 * A URL the server may poll for a newer model manifest. Unset by default: the server then uses
 * only the manifest bundled with this build and makes no request.
 */
// TODO(amicited-infra): host our own model manifest to ship model updates between releases
// (https://github.com/QualityUnit/amicited-desktop/issues/17).
export const MODEL_MANIFEST_URL_ENV_VAR = "AMICITED_MODEL_MANIFEST_URL";

/**
 * The T3 Code release this build's code is merged from. The bundled model manifest's provider
 * compatibility advisories are keyed by T3 Code versions (`t3CodeRange`), so they are matched
 * against this, never against AmICited's own version. Update it with each weekly upstream merge
 * to the `version` in upstream's apps/server/package.json.
 */
export const UPSTREAM_T3_CODE_VERSION = "0.1.7";

/** Where the shell installer (scripts/install.sh) is served, for copy that tells users to run it. */
// TODO(amicited-infra): serve scripts/install.sh there
// (https://github.com/QualityUnit/amicited-desktop/issues/17).
export const INSTALL_SCRIPT_URL = "https://amicited.com/install.sh";

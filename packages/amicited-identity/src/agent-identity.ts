/**
 * Identity AmICited sends to AI providers, agents, MCP clients, GitHub and users' git repos,
 * beyond the shared constants in `./index.ts`.
 */

/**
 * Our GitHub App for "Sign in with GitHub". Null hides app sign-in; tokens and gh still work.
 * TODO(amicited-infra): our GitHub App. Set its name, install URL and client ID variable.
 * https://github.com/QualityUnit/amicited-desktop/issues/17
 */
export const GITHUB_APP: { readonly name: string; readonly installUrl: string } | null = null;

/** The server reads the GitHub App's public client ID from this variable. Unset turns sign-in off. */
export const GITHUB_APP_CLIENT_ID_ENV_VAR = "AMICITED_GITHUB_APP_CLIENT_ID";

/** Git refs and branches AmICited creates in users' repositories start with this. */
export const GIT_REF_NAMESPACE = "amicited";

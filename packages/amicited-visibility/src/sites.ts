/** Sites the user signs in to. Several engines can share one site (Gemini and both Google engines). */
export const sites = {
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT",
    url: "https://chatgpt.com/",
    hosts: ["chatgpt.com"],
    loggedIn: '[data-testid="accounts-profile-button"], [data-testid="profile-button"]',
    loggedOut: '[data-testid="login-button"], form[data-logged-out]',
    cookies: ["chatgpt.com", "openai.com"],
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    url: "https://www.perplexity.ai/",
    hosts: ["www.perplexity.ai", "perplexity.ai"],
    loggedIn: 'a[href*="/settings"], button[data-testid="user-menu-button"]',
    loggedOut: 'a[href*="/auth/signin"], [data-testid="login-modal"]',
    cookies: ["perplexity.ai"],
  },
  claude: {
    id: "claude",
    label: "Claude",
    url: "https://claude.ai/new",
    hosts: ["claude.ai"],
    loggedIn: 'button[data-testid="user-menu-button"]',
    loggedOut: 'a[href*="/login"], form[action*="login"]',
    cookies: ["claude.ai"],
  },
  google: {
    id: "google",
    label: "Google (Gemini and AI Overviews)",
    url: "https://www.google.com/",
    hosts: ["www.google.com", "gemini.google.com", "consent.google.com"],
    loggedIn: 'a[href*="accounts.google.com/SignOutOptions"], a[href*="myaccount.google.com"]',
    loggedOut:
      'a[href*="accounts.google.com/ServiceLogin"], [data-test-id="sidenav-error-action-link"]',
    cookies: ["google.com"],
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    url: "https://www.linkedin.com/feed/",
    hosts: ["www.linkedin.com"],
    loggedIn: '[data-control-name="identity_welcome_message"]',
    loggedOut: 'input[name="session_key"]',
    cookies: ["linkedin.com"],
  },
} as const;
export type SiteId = keyof typeof sites;
export type Site = (typeof sites)[SiteId];

/** Markers shared by every site for a CAPTCHA or bot challenge. */
export const challengeSelectors = [
  'iframe[src*="captcha"]',
  "#captcha",
  "#challenge-running",
  '[name="cf-turnstile-response"]',
  'iframe[src*="challenges.cloudflare.com"]',
  "#recaptcha",
] as const;
const challengeUrls = [
  /\/sorry\//,
  /\/cdn-cgi\/challenge-platform\//,
  /challenges\.cloudflare\.com/,
];
const challengeTitles = [/^just a moment/i, /^attention required/i, /unusual traffic/i];

export type ProbeResult = "logged_in" | "logged_out" | "captcha" | "unknown";
export function classifyProbe(markers: {
  loggedIn: boolean;
  loggedOut: boolean;
  captcha: boolean;
}): ProbeResult {
  return markers.captcha
    ? "captcha"
    : markers.loggedOut
      ? "logged_out"
      : markers.loggedIn
        ? "logged_in"
        : "unknown";
}
export function isChallengePage(page: { url: string; title: string }) {
  return (
    challengeUrls.some((pattern) => pattern.test(page.url)) ||
    challengeTitles.some((pattern) => pattern.test(page.title))
  );
}

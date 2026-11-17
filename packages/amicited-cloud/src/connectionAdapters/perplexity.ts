export default {
  id: "perplexity",
  label: "Perplexity",
  url: "https://www.perplexity.ai/",
  loggedIn: 'button[aria-label="Account"]',
  loggedOut: 'button:has-text("Sign in")',
  cookies: ["perplexity.ai"],
} as const;

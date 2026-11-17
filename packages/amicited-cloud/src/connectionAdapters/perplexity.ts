export default {
  id: "perplexity",
  label: "Perplexity",
  url: "https://www.perplexity.ai/",
  loggedIn: 'a[href*="/settings"], button[data-testid="user-menu-button"]',
  loggedOut: 'a[href*="/auth/signin"]',
  cookies: ["perplexity.ai"],
} as const;

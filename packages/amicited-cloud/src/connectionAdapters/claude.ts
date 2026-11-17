export default {
  id: "claude",
  label: "Claude",
  url: "https://claude.ai/new",
  loggedIn: 'button[data-testid="user-menu-button"]',
  loggedOut: 'a[href*="/login"], form[action*="login"]',
  cookies: ["claude.ai"],
} as const;

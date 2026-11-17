export default {
  id: "claude",
  label: "Claude",
  url: "https://claude.ai/new",
  loggedIn: 'button[data-testid="user-menu-button"]',
  loggedOut: 'button:has-text("Log in")',
  cookies: ["claude.ai"],
} as const;

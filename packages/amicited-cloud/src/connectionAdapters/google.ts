export default {
  id: "google",
  label: "Google AI Overviews and AI Mode",
  url: "https://www.google.com/",
  loggedIn: 'a[aria-label*="Google Account"]',
  loggedOut: 'a:has-text("Sign in")',
  cookies: ["google.com"],
} as const;

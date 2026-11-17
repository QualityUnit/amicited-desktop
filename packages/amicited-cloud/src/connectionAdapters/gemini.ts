export default {
  id: "gemini",
  label: "Gemini",
  url: "https://gemini.google.com/app",
  loggedIn: 'a[aria-label*="Google Account"]',
  loggedOut: 'a:has-text("Sign in")',
  cookies: ["google.com"],
} as const;

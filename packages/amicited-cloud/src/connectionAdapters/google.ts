export default {
  id: "google",
  label: "Google (Gemini, AI Overviews and AI Mode)",
  url: "https://www.google.com/",
  loggedIn: 'a[href*="accounts.google.com/SignOutOptions"], a[href*="myaccount.google.com"]',
  loggedOut: 'a[href*="accounts.google.com/ServiceLogin"]',
  cookies: ["google.com"],
} as const;

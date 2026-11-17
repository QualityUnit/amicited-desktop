export default {
  id: "linkedin",
  label: "LinkedIn",
  url: "https://www.linkedin.com/feed/",
  loggedIn: '[data-control-name="identity_welcome_message"]',
  loggedOut: 'input[name="session_key"]',
  cookies: ["linkedin.com"],
} as const;

export default {
  id: "chatgpt",
  label: "ChatGPT",
  url: "https://chatgpt.com/",
  loggedIn: '[data-testid="profile-button"]',
  loggedOut: '[data-testid="login-button"]',
  cookies: ["chatgpt.com", "openai.com"],
} as const;

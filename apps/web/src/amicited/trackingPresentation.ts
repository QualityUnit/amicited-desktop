export function engineLabel(engine: string) {
  return (
    (
      {
        google: "Google AI Mode",
        google_overviews: "AI Overviews",
        gemini: "Gemini",
        chatgpt: "ChatGPT",
        perplexity: "Perplexity",
        claude: "Claude",
      } as Record<string, string>
    )[engine] ?? "AI app"
  );
}

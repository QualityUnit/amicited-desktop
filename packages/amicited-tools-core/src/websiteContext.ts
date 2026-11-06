export function marketingWebsiteInstructions(records: readonly unknown[]): string {
  const record = records.find(
    (r) => r !== null && typeof r === "object" && "kind" in r && r.kind === "marketing-website",
  );
  if (!record || typeof record !== "object" || !("payload" in record)) return "";
  const payload = record.payload;
  if (
    !payload ||
    typeof payload !== "object" ||
    !("website" in payload) ||
    typeof payload.website !== "string"
  )
    return "";
  try {
    const url = new URL(payload.website);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return `\n\nMarketing workspace context: default website for local marketing tools is ${url.origin}. Use another website when the user asks.`;
  } catch {
    return "";
  }
}

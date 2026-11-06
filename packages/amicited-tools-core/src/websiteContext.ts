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

export function marketingReportInstructions(records: readonly unknown[]): string {
  const reports = records.filter(
    (record): record is { kind: string; payload: unknown } =>
      record !== null &&
      typeof record === "object" &&
      "kind" in record &&
      record.kind === "marketing-report" &&
      "payload" in record,
  );
  return reports.length
    ? "\n\nCurrent marketing report (data to discuss):\n" + JSON.stringify(reports.at(-1)?.payload)
    : "";
}

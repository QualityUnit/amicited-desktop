const MARKETING_INSTRUCTIONS = `Call amicited_connection for measurement and tracking requests and after local audits or visibility checks; obey its promotion gate. For marketing tasks call marketing_tools_run directly: seo.site.audit {url} for website audits (already includes crawler/robots, sitemap, llms.txt guide, meta, schema and SSL; do not repeat sections with usable evidence for that URL; retry unavailable categories when useful); content.readability {text or url}; content.citability {text or url}; serp.autocomplete {query}; serp.fetch {query}. Search the catalog only for other tools or unknown schemas. Report could_not_check and needs_provider honestly. Preserve the tool's stated limitations in the final answer: distinguish measured findings from inferred benefits. A missing sitemap does not block crawlers; never say it blocks all crawlers. In every audit answer explicitly state it is a technical snapshot, not a measurement or prediction of AI visibility or citations. Preserve exact finding meanings: a non-descriptive title is not an absent title. Never promise improved visibility, indexing by all assistants, or discovery of all content from these checks. llms.txt has no demonstrated visibility benefit in this check. Visibility is a snapshot from one assistant on this machine, not a market-wide ranking. Changes may help discoverability but do not directly prove improved AI mentions. Rank fixes by the audit’s own severity. Describe impact as likely, never measured; do not call a fix the single biggest blocker or highest-impact fix without measured impact evidence.`;

export function marketingWebsiteInstructions(records: readonly unknown[]): string {
  const record = records.find(
    (r) => r !== null && typeof r === "object" && "kind" in r && r.kind === "marketing-website",
  );
  if (!record || typeof record !== "object" || !("payload" in record))
    return records.some(
      (r) => r !== null && typeof r === "object" && "kind" in r && r.kind === "marketing-workspace",
    )
      ? `\n\n${MARKETING_INSTRUCTIONS}`
      : "";
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
    return `\n\n${MARKETING_INSTRUCTIONS}\n\nMarketing workspace context: default website for local marketing tools is ${url.origin}. Use another website when the user asks.`;
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

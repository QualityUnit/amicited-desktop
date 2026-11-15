import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";

export type ReportLinkTarget = { reportId: string } | { snapshotId: string };
export type ReportFormat = "preview" | "html" | "pdf" | "pptx";
type Links = { preview?: string; html?: string; pdf?: string; pptx?: string };

export async function fetchReportResource(
  links: (target: ReportLinkTarget) => Promise<Links>,
  target: ReportLinkTarget,
  format: ReportFormat,
  origin: string,
  signal?: AbortSignal,
) {
  const request = async () => {
    const path = (await links(target))[format];
    const resolved = path ? resolveAssetUrl(origin, path) : null;
    if (!resolved) throw new Error("Could not prepare the report link. Try again.");
    const url = new URL(resolved);
    if (format === "preview") url.searchParams.set("embed", "1");
    return fetch(url, { signal: signal ?? null });
  };
  let response = await request();
  if (response.status === 401) response = await request();
  if (!response.ok) {
    const message = (await response.text()).slice(0, 1500).trim();
    throw new Error(message || `Report could not be loaded (HTTP ${response.status}).`);
  }
  return response.blob();
}

export function downloadReportBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

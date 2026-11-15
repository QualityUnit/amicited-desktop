import { useEffect, useState, type ReactNode } from "react";

export function groupReports<
  T extends { projectId: string; title: string; archivedAt: string | null },
>(
  reports: readonly T[],
  domains: readonly { projectId: string; hostname: string }[],
  archived: boolean,
) {
  return domains
    .map((domain) => ({
      ...domain,
      reports: reports
        .filter(
          (report) => report.projectId === domain.projectId && (archived || !report.archivedAt),
        )
        .toSorted((a, b) => a.title.localeCompare(b.title)),
    }))
    .filter((group) => group.reports.length)
    .toSorted((a, b) => a.hostname.localeCompare(b.hostname));
}

export function ReportPage({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">{children}</div>;
}

export function ReportViewer({ src, preview }: { src: string; preview: boolean }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(1360);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Fit fixed-size paper to the actual viewer width without changing report typography.
  useEffect(() => {
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);
  const scale = Math.min(1, width / 1360);
  return (
    <section className="flex min-w-0 flex-col gap-2">
      {preview && <p className="text-sm text-muted-foreground">Preview · not a saved run</p>}
      <div ref={setHost} className="h-[75vh] overflow-hidden rounded-lg border bg-white">
        <iframe
          title={preview ? "Report preview" : "Saved report"}
          src={src}
          sandbox=""
          style={{
            width: Math.max(width, 1360),
            height: `calc(75vh / ${scale || 1})`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </section>
  );
}

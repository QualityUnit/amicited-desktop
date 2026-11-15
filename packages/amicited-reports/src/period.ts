import type { ReportSpec } from "./spec.ts";
export interface Period {
  start: string;
  end: string;
  label: string;
}
const date = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (d: Date, days: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
export function resolvePeriod(
  spec: ReportSpec["period"],
  now = new Date(),
): { period: Period; comparison: Period | null } {
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = end;
  const kind = spec.default;
  if (kind.startsWith("last_")) {
    end = shift(end, -1);
    start = shift(end, 1 - Number(kind.split("_")[1]));
  } else if (kind === "previous_month") {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    end = new Date(end.getFullYear(), end.getMonth(), 0);
  } else if (kind === "previous_quarter") {
    const month = Math.floor(end.getMonth() / 3) * 3;
    start = new Date(end.getFullYear(), month - 3, 1);
    end = new Date(end.getFullYear(), month, 0);
  } else start = new Date(end.getFullYear(), kind === "year_to_date" ? 0 : end.getMonth(), 1);
  const make = (a: Date, b: Date): Period => ({
    start: date(a),
    end: date(b),
    label: `${a.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(a.getFullYear() !== b.getFullYear() ? { year: "numeric" } : {}) })} – ${b.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  });
  const period = make(start, end);
  if (kind === "previous_month")
    period.label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (kind === "previous_quarter")
    period.label = `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
  if (spec.comparison === "none") return { period, comparison: null };
  if (spec.comparison === "previous_year") {
    const previous = (d: Date) => {
      const year = d.getFullYear() - 1;
      return new Date(
        year,
        d.getMonth(),
        Math.min(d.getDate(), new Date(year, d.getMonth() + 1, 0).getDate()),
      );
    };
    return { period, comparison: make(previous(start), previous(end)) };
  }
  const days =
    (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
      86400000 +
    1;
  return { period, comparison: make(shift(start, -days), shift(start, -1)) };
}

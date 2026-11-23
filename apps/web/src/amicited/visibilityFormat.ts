export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const percent = (value: number | null) => (value === null ? "–" : `${value.toFixed(1)}%`);
/** Signed change in points; null when either side was never measured. */
export const change = (value: number | null, previous: number | null) =>
  value === null || previous === null ? null : Math.round((value - previous) * 10) / 10;

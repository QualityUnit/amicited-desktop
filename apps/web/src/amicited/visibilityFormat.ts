export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
export const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const percent = (value: number | null) => (value === null ? "–" : `${value.toFixed(1)}%`);
/** Signed change in points; null when either side was never measured. */
export const change = (value: number | null, previous: number | null) =>
  value === null || previous === null ? null : Math.round((value - previous) * 10) / 10;
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const localToday = () => new Date().toLocaleDateString("en-CA");
/** "today" or "Nov 22", for a local day. */
export const dayOrToday = (day: string, today = localToday()) =>
  day === today ? "today" : dayLabel(day);
/** "today at 09:02" or "Nov 22 at 09:02". */
export const when = (iso: string, today = localToday()) =>
  `${dayOrToday(new Date(iso).toLocaleDateString("en-CA"), today)} at ${clock(iso)}`;
/** Whether the daily check time is still ahead of us today. */
export const laterToday = (time: string) =>
  new Date().toTimeString().slice(0, 5) < time ? "today" : "tomorrow";

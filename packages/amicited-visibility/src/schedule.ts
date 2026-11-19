/** Local calendar day (YYYY-MM-DD) of an instant, in this process's time zone. */
export function localDay(at: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}
export function addDays(day: string, delta: number) {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + delta);
  return at.toISOString().slice(0, 10);
}

export interface DailyPlan {
  /** The slot to run now, or null when the latest slot already ran or is not yet due. */
  readonly due: string | null;
  /** The most recent slot whose time has passed. */
  readonly latestSlot: string;
  /** Slots that passed without a run and will not be caught up. */
  readonly missed: readonly string[];
}
/**
 * Plans a once-a-day run at `time` (HH:MM, local). Each day is one slot. A slot that
 * passed while the computer was off or asleep runs once when the app next ticks, and
 * only the latest unrun slot is caught up; older ones are reported as missed.
 * `lastRunSlot` is the latest slot with any persisted run, so a slot never runs twice.
 */
export function planDailyRun(input: {
  readonly now: Date;
  readonly time: string;
  readonly lastRunSlot?: string | undefined;
  /** The day tracking was set up; earlier slots do not exist. */
  readonly firstSlot?: string | undefined;
}): DailyPlan {
  const today = localDay(input.now);
  const clock = `${String(input.now.getHours()).padStart(2, "0")}:${String(input.now.getMinutes()).padStart(2, "0")}`;
  const latestSlot = clock >= input.time ? today : addDays(today, -1);
  const none = { due: null, latestSlot, missed: [] };
  if (input.firstSlot && latestSlot < input.firstSlot) return none;
  if (input.lastRunSlot && input.lastRunSlot >= latestSlot) return none;
  const missed: string[] = [];
  let cursor = input.lastRunSlot ? addDays(input.lastRunSlot, 1) : (input.firstSlot ?? latestSlot);
  if (input.firstSlot && cursor < input.firstSlot) cursor = input.firstSlot;
  const oldest = addDays(latestSlot, -366);
  if (cursor < oldest) cursor = oldest;
  for (; cursor < latestSlot; cursor = addDays(cursor, 1)) missed.push(cursor);
  return { due: latestSlot, latestSlot, missed };
}

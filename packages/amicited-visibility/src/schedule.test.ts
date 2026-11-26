import { describe, expect, it } from "vite-plus/test";
import { planDailyRun } from "./schedule.ts";

const at = (day: string, time: string) => new Date(`${day}T${time}:00`);

describe("daily schedule", () => {
  it("runs a slot once its time passes and never twice", () => {
    const first = { time: "09:00", firstSlot: "2026-11-18" };
    expect(planDailyRun({ ...first, now: at("2026-11-18", "08:59") }).due).toBeNull();
    expect(planDailyRun({ ...first, now: at("2026-11-18", "09:00") }).due).toBe("2026-11-18");
    expect(
      planDailyRun({ ...first, now: at("2026-11-18", "23:00"), lastRunSlot: "2026-11-18" }).due,
    ).toBeNull();
    expect(
      planDailyRun({ ...first, now: at("2026-11-19", "08:00"), lastRunSlot: "2026-11-18" }).due,
    ).toBeNull();
  });

  it("catches up only the latest slot missed while the computer was off", () => {
    const plan = planDailyRun({
      now: at("2026-11-22", "08:00"),
      time: "09:00",
      lastRunSlot: "2026-11-18",
      firstSlot: "2026-11-01",
    });
    expect(plan).toEqual({
      due: "2026-11-21",
      latestSlot: "2026-11-21",
      missed: ["2026-11-19", "2026-11-20"],
    });
    const caughtUp = { time: "09:00", lastRunSlot: "2026-11-21", firstSlot: "2026-11-01" };
    expect(planDailyRun({ ...caughtUp, now: at("2026-11-22", "08:30") }).due).toBeNull();
    expect(planDailyRun({ ...caughtUp, now: at("2026-11-22", "09:30") }).due).toBe("2026-11-22");
  });

  it("does not invent slots before tracking was set up", () => {
    expect(
      planDailyRun({ now: at("2026-11-20", "10:00"), time: "09:00", firstSlot: "2026-11-18" }),
    ).toEqual({
      due: "2026-11-20",
      latestSlot: "2026-11-20",
      missed: ["2026-11-18", "2026-11-19"],
    });
    expect(
      planDailyRun({ now: at("2026-11-18", "08:00"), time: "09:00", firstSlot: "2026-11-18" }).due,
    ).toBeNull();
  });
});

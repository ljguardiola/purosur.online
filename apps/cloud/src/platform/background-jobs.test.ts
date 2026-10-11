import { describe, expect, it } from "vitest";
import { crontabLineEvery } from "./background-jobs.js";
import { scheduleOfCrontabLine } from "./test-support/crontab-schedule.js";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

describe("crontabLineEvery", () => {
  it.each([
    ["one minute", MINUTE_MS],
    ["five minutes", 5 * MINUTE_MS],
    ["thirty minutes", 30 * MINUTE_MS],
    ["one hour", HOUR_MS],
    ["six hours", 6 * HOUR_MS],
    ["one day", 24 * HOUR_MS],
  ])("schedules the task every %s, evenly through the day", (_name, intervalMs) => {
    const schedule = scheduleOfCrontabLine(crontabLineEvery(intervalMs, "some-task"));

    expect(schedule.task).toBe("some-task");
    expect(schedule.gapsMs.length).toBe((24 * HOUR_MS) / intervalMs);
    expect(new Set(schedule.gapsMs)).toEqual(new Set([intervalMs]));
  });

  it.each([
    ["shorter than a minute", 30 * 1000],
    ["not a whole number of minutes", 90 * 1000],
    ["a number of minutes that does not divide an hour", 7 * MINUTE_MS],
    ["more than an hour but not a whole number of hours", 90 * MINUTE_MS],
    ["a number of hours that does not divide a day", 5 * HOUR_MS],
    ["longer than a day", 48 * HOUR_MS],
    ["zero", 0],
    ["negative", -MINUTE_MS],
  ])("refuses an interval %s, which a crontab line cannot repeat evenly", (_name, intervalMs) => {
    expect(() => crontabLineEvery(intervalMs, "some-task")).toThrow(RangeError);
  });
});

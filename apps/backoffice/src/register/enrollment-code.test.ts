import { expect, test } from "vitest";
import { minutesElapsed, minutesRemaining } from "./enrollment-code";

const NOW = new Date("2026-09-25T12:00:00.000Z");

test("counts the whole minutes since the code was issued", () => {
  expect(minutesElapsed("2026-09-25T11:55:59.000Z", NOW)).toBe(4);
  expect(minutesElapsed("2026-09-25T11:59:40.000Z", NOW)).toBe(0);
});

test("never counts a negative elapsed time for a code issued after the clock's reading", () => {
  expect(minutesElapsed("2026-09-25T12:01:00.000Z", NOW)).toBe(0);
});

test("rounds the minutes left up to the next whole minute", () => {
  expect(minutesRemaining("2026-09-25T12:10:01.000Z", NOW)).toBe(11);
  expect(minutesRemaining("2026-09-25T12:11:00.000Z", NOW)).toBe(11);
});

test("leaves at least one minute for a code about to expire", () => {
  expect(minutesRemaining("2026-09-25T12:00:00.000Z", NOW)).toBe(1);
});

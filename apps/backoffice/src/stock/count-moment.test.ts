import { CalendarDate } from "@internationalized/date";
import { FIXED_ARGENTINA_ZONE_RULES } from "@purosur/domain";
import { expect, test } from "vitest";
import { countMomentInstant, countMomentNow, countOccurredAt } from "./count-moment";

test("starts a count at the current minute of Argentina's clock, keeping the exact instant", () => {
  expect(countMomentNow(new Date("2026-09-15T21:32:48.123Z"))).toEqual({
    day: new CalendarDate(2026, 9, 15),
    time: "18:32",
    instant: "2026-09-15T21:32:48.123Z",
  });
});

test("starts a count late at night on Argentina's day, not the UTC one", () => {
  expect(countMomentNow(new Date("2026-09-16T01:05:00.000Z"))).toMatchObject({
    day: new CalendarDate(2026, 9, 15),
    time: "22:05",
  });
});

test("writes a time just after midnight in Argentina as 00, not 24", () => {
  expect(countMomentNow(new Date("2026-09-16T03:05:00.000Z"))).toMatchObject({
    day: new CalendarDate(2026, 9, 16),
    time: "00:05",
  });
});

test("turns a day and a time in Argentina into that instant", () => {
  const instant = countMomentInstant(
    { day: new CalendarDate(2026, 9, 15), time: "18:32" },
    FIXED_ARGENTINA_ZONE_RULES,
  );

  expect(instant && new Date(instant).toISOString()).toBe("2026-09-15T21:32:00.000Z");
});

test.each(["", "1832", "24:00", "18:60", "8:32", "18:32:00", " 18:32"])(
  "has no instant for the time %j",
  (time) => {
    expect(
      countMomentInstant({ day: new CalendarDate(2026, 9, 15), time }, FIXED_ARGENTINA_ZONE_RULES),
    ).toBeUndefined();
  },
);

test("has no instant without a day", () => {
  expect(
    countMomentInstant({ day: null, time: "18:32" }, FIXED_ARGENTINA_ZONE_RULES),
  ).toBeUndefined();
});

test("counts at the exact instant it started while its day and time are left as they were", () => {
  const start = countMomentNow(new Date("2026-09-15T21:32:48.123Z"));

  expect(
    countOccurredAt({ day: start.day, time: start.time }, start, FIXED_ARGENTINA_ZONE_RULES),
  ).toBe("2026-09-15T21:32:48.123Z");
});

test("counts at the minute chosen once its day or time changes", () => {
  const start = countMomentNow(new Date("2026-09-15T21:32:48.123Z"));

  const changedTime = countOccurredAt(
    { day: start.day, time: "18:10" },
    start,
    FIXED_ARGENTINA_ZONE_RULES,
  );
  const changedDay = countOccurredAt(
    { day: new CalendarDate(2026, 9, 14), time: "18:32" },
    start,
    FIXED_ARGENTINA_ZONE_RULES,
  );

  expect(changedTime && new Date(changedTime).toISOString()).toBe("2026-09-15T21:10:00.000Z");
  expect(changedDay && new Date(changedDay).toISOString()).toBe("2026-09-14T21:32:00.000Z");
});

test("turns a day and a time into the instant on the offset of the zone rules it is given", () => {
  const rules = { version: "2026a", transitions: [{ from: new Date(0), offsetMinutes: -120 }] };

  const instant = countMomentInstant({ day: new CalendarDate(2026, 9, 15), time: "18:32" }, rules);

  expect(instant && new Date(instant).toISOString()).toBe("2026-09-15T20:32:00.000Z");
});

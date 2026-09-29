import { CalendarDate } from "@internationalized/date";
import { expect, test } from "vitest";
import { countMomentInstant, countMomentNow } from "./count-moment";

test("starts a count at the current minute of Argentina's clock", () => {
  expect(countMomentNow(new Date("2026-09-15T21:32:48.123Z"))).toEqual({
    day: new CalendarDate(2026, 9, 15),
    time: "18:32",
  });
});

test("starts a count late at night on Argentina's day, not the UTC one", () => {
  expect(countMomentNow(new Date("2026-09-16T01:05:00.000Z"))).toEqual({
    day: new CalendarDate(2026, 9, 15),
    time: "22:05",
  });
});

test("turns a day and a time in Argentina into that instant", () => {
  const instant = countMomentInstant({ day: new CalendarDate(2026, 9, 15), time: "18:32" });

  expect(instant && new Date(instant).toISOString()).toBe("2026-09-15T21:32:00.000Z");
});

test("reads back the moment it starts a count at", () => {
  const now = new Date("2026-09-15T21:32:48.123Z");

  const instant = countMomentInstant(countMomentNow(now));

  expect(instant && new Date(instant).toISOString()).toBe("2026-09-15T21:32:00.000Z");
});

test.each(["", "1832", "24:00", "18:60", "8:32", "18:32:00", " 18:32"])(
  "has no instant for the time %j",
  (time) => {
    expect(countMomentInstant({ day: new CalendarDate(2026, 9, 15), time })).toBeUndefined();
  },
);

test("has no instant without a day", () => {
  expect(countMomentInstant({ day: null, time: "18:32" })).toBeUndefined();
});

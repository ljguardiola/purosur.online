import { describe, expect, it } from "vitest";
import {
  ARGENTINA_TIME_ZONE,
  argentinaCalendarDay,
  argentinaInstant,
} from "./argentina-calendar.js";

describe("ARGENTINA_TIME_ZONE", () => {
  it("is Buenos Aires' IANA time zone", () => {
    expect(ARGENTINA_TIME_ZONE).toBe("America/Argentina/Buenos_Aires");
  });
});

describe("argentinaCalendarDay", () => {
  it("reads the calendar day in Argentina as a zero-padded ISO date", () => {
    expect(argentinaCalendarDay(new Date("2026-03-05T12:00:00-03:00"))).toBe("2026-03-05");
  });

  it("keeps Argentina's day late in the evening, after UTC has moved to the next one", () => {
    expect(argentinaCalendarDay(new Date("2026-09-25T23:30:00-03:00"))).toBe("2026-09-25");
  });

  it("moves to Argentina's next day at its own midnight", () => {
    expect(argentinaCalendarDay(new Date("2026-09-26T00:00:00-03:00"))).toBe("2026-09-26");
  });
});

describe("argentinaInstant", () => {
  it("writes a day and a time on Argentina's clock as an ISO instant with its offset", () => {
    expect(argentinaInstant("2026-09-25", "14:30")).toBe("2026-09-25T14:30:00-03:00");
  });

  it("names the same instant as the wall-clock time read in Argentina", () => {
    const instant = new Date(argentinaInstant("2026-09-25", "23:30"));

    expect(instant.toISOString()).toBe("2026-09-26T02:30:00.000Z");
    expect(argentinaCalendarDay(instant)).toBe("2026-09-25");
  });

  it.each([
    ["a day of Argentina's last summer time", "2008-12-15", "12:00"],
    ["the first hours after Argentina last moved its clocks forward", "2008-10-19", "02:00"],
    ["a day before Argentina's clocks followed a standard offset", "1900-01-01", "10:00"],
    ["a day in the first hundred years of the calendar", "0050-01-01", "10:00"],
  ])("writes %s on Argentina's current offset", (_case, day, time) => {
    expect(argentinaInstant(day, time)).toBe(`${day}T${time}:00-03:00`);
  });
});

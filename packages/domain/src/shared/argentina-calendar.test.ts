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

  it("takes the offset Argentina's time zone had on that day, as during its summer time", () => {
    expect(argentinaInstant("2008-12-15", "12:00")).toBe("2008-12-15T12:00:00-02:00");
  });

  it("takes the offset in force after a clock change, in the hours right after it", () => {
    expect(argentinaInstant("2008-10-19", "02:00")).toBe("2008-10-19T02:00:00-02:00");
  });
});

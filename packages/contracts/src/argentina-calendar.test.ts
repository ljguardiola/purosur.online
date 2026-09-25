import { describe, expect, it } from "vitest";
import { ARGENTINA_TIME_ZONE, argentinaCalendarDay } from "./argentina-calendar";

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

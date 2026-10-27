import { describe, expect, it } from "vitest";
import {
  ARGENTINA_TIME_ZONE,
  argentinaCalendarDay,
  argentinaInstant,
} from "./argentina-calendar.js";
import { fixedOffsetZoneRules } from "./test-support/fake-zone-rules-source.js";
import { FIXED_ARGENTINA_ZONE_RULES, type ZoneRules } from "./zone-rules.js";

describe("ARGENTINA_TIME_ZONE", () => {
  it("is Buenos Aires' IANA time zone", () => {
    expect(ARGENTINA_TIME_ZONE).toBe("America/Argentina/Buenos_Aires");
  });
});

const SUMMER_TIME: ZoneRules = {
  version: "2026a",
  transitions: [
    { from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: -180 },
    { from: new Date("2030-03-01T03:00:00Z"), offsetMinutes: -120 },
    { from: new Date("2030-10-01T02:00:00Z"), offsetMinutes: -180 },
  ],
};

describe("argentinaCalendarDay", () => {
  it("reads the calendar day in Argentina as a zero-padded ISO date", () => {
    expect(
      argentinaCalendarDay(new Date("2026-03-05T12:00:00-03:00"), FIXED_ARGENTINA_ZONE_RULES),
    ).toBe("2026-03-05");
  });

  it("keeps Argentina's day late in the evening, after UTC has moved to the next one", () => {
    expect(
      argentinaCalendarDay(new Date("2026-09-25T23:30:00-03:00"), FIXED_ARGENTINA_ZONE_RULES),
    ).toBe("2026-09-25");
  });

  it("moves to Argentina's next day at its own midnight", () => {
    expect(
      argentinaCalendarDay(new Date("2026-09-26T00:00:00-03:00"), FIXED_ARGENTINA_ZONE_RULES),
    ).toBe("2026-09-26");
  });
});

describe("argentinaCalendarDay under given rules", () => {
  it("reads the day on the clock of the offset the rules give", () => {
    const instant = new Date("2026-09-26T01:30:00Z");

    expect(argentinaCalendarDay(instant, fixedOffsetZoneRules(-180))).toBe("2026-09-25");
    expect(argentinaCalendarDay(instant, fixedOffsetZoneRules(0))).toBe("2026-09-26");
    expect(argentinaCalendarDay(instant, fixedOffsetZoneRules(-120))).toBe("2026-09-25");
    expect(argentinaCalendarDay(instant, fixedOffsetZoneRules(150))).toBe("2026-09-26");
  });

  it("changes day at the instant a transition starts", () => {
    expect(argentinaCalendarDay(new Date("2030-03-01T02:59:59Z"), SUMMER_TIME)).toBe("2030-02-28");
    expect(argentinaCalendarDay(new Date("2030-03-01T03:00:00Z"), SUMMER_TIME)).toBe("2030-03-01");
  });
});

describe("argentinaInstant", () => {
  it("writes a day and a time on Argentina's clock as an ISO instant with its offset", () => {
    expect(argentinaInstant("2026-09-25", "14:30", FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2026-09-25T14:30:00-03:00",
    );
  });

  it("names the same instant as the wall-clock time read in Argentina", () => {
    const instant = new Date(argentinaInstant("2026-09-25", "23:30", FIXED_ARGENTINA_ZONE_RULES));

    expect(instant.toISOString()).toBe("2026-09-26T02:30:00.000Z");
    expect(argentinaCalendarDay(instant, FIXED_ARGENTINA_ZONE_RULES)).toBe("2026-09-25");
  });

  it.each([
    ["a day of Argentina's last summer time", "2008-12-15", "12:00"],
    ["the first hours after Argentina last moved its clocks forward", "2008-10-19", "02:00"],
    ["a day before Argentina's clocks followed a standard offset", "1900-01-01", "10:00"],
    ["a day in the first hundred years of the calendar", "0050-01-01", "10:00"],
  ])("writes %s on Argentina's current offset", (_case, day, time) => {
    expect(argentinaInstant(day, time, FIXED_ARGENTINA_ZONE_RULES)).toBe(`${day}T${time}:00-03:00`);
  });
});

describe("argentinaInstant under given rules", () => {
  it("writes the offset the rules give for that wall-clock time", () => {
    expect(argentinaInstant("2026-09-25", "14:30", fixedOffsetZoneRules(-120))).toBe(
      "2026-09-25T14:30:00-02:00",
    );
    expect(argentinaInstant("2026-09-25", "14:30", fixedOffsetZoneRules(0))).toBe(
      "2026-09-25T14:30:00+00:00",
    );
  });

  it("writes an offset that is not a whole number of hours with its minutes", () => {
    expect(argentinaInstant("2026-09-25", "14:30", fixedOffsetZoneRules(330))).toBe(
      "2026-09-25T14:30:00+05:30",
    );
    expect(argentinaInstant("2026-09-25", "14:30", fixedOffsetZoneRules(-210))).toBe(
      "2026-09-25T14:30:00-03:30",
    );
  });

  it("follows the transitions of the rules from one day to the next", () => {
    expect(argentinaInstant("2030-02-28", "12:00", SUMMER_TIME)).toBe("2030-02-28T12:00:00-03:00");
    expect(argentinaInstant("2030-03-01", "12:00", SUMMER_TIME)).toBe("2030-03-01T12:00:00-02:00");
    expect(argentinaInstant("2030-10-01", "12:00", SUMMER_TIME)).toBe("2030-10-01T12:00:00-03:00");
  });

  it("uses the offset in force after a transition for a wall-clock time that exists only after it", () => {
    expect(argentinaInstant("2030-10-01", "00:00", SUMMER_TIME)).toBe("2030-10-01T00:00:00-03:00");
  });

  it("writes a wall-clock time a forward transition skips on the offset before it, so the instant stays on its own day", () => {
    const skipped = argentinaInstant("2030-03-01", "00:30", SUMMER_TIME);

    expect(skipped).toBe("2030-03-01T00:30:00-03:00");
    expect(argentinaCalendarDay(new Date(skipped), SUMMER_TIME)).toBe("2030-03-01");
  });

  it("writes a wall-clock time a forward transition skips before midnight on the offset after it, so the instant stays on its own day", () => {
    const summerTimeFromMidnight: ZoneRules = {
      version: "2026a",
      transitions: [
        { from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: -180 },
        { from: new Date("2030-03-01T02:00:00Z"), offsetMinutes: -120 },
      ],
    };

    const skipped = argentinaInstant("2030-02-28", "23:30", summerTimeFromMidnight);

    expect(skipped).toBe("2030-02-28T23:30:00-02:00");
    expect(argentinaCalendarDay(new Date(skipped), summerTimeFromMidnight)).toBe("2030-02-28");
  });

  it("names the same instant as the wall-clock time read back under the same rules", () => {
    const instant = new Date(argentinaInstant("2030-06-01", "23:30", SUMMER_TIME));

    expect(instant.toISOString()).toBe("2030-06-02T01:30:00.000Z");
    expect(argentinaCalendarDay(instant, SUMMER_TIME)).toBe("2030-06-01");
  });
});

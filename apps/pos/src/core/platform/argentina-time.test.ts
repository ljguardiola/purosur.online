import { FIXED_ARGENTINA_ZONE_RULES, type ZoneRules } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { inArgentinaTime } from "./argentina-time";

const SUMMER_TIME: ZoneRules = {
  version: "2026a",
  transitions: [
    { from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: -180 },
    { from: new Date("2030-03-01T03:00:00Z"), offsetMinutes: -120 },
  ],
};

function atOffset(offsetMinutes: number): ZoneRules {
  return { version: null, transitions: [{ from: new Date(-8.64e15), offsetMinutes }] };
}

describe("inArgentinaTime", () => {
  it("writes an instant with Argentina's clock time and offset", () => {
    expect(inArgentinaTime(new Date("2026-09-30T12:00:00.000Z"), FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2026-09-30T09:00:00.000-03:00",
    );
  });

  it("writes an instant after midnight in UTC on Argentina's previous evening", () => {
    expect(inArgentinaTime(new Date("2026-10-01T02:30:15.250Z"), FIXED_ARGENTINA_ZONE_RULES)).toBe(
      "2026-09-30T23:30:15.250-03:00",
    );
  });

  it("writes the same instant it was given", () => {
    const instant = new Date("2026-09-30T12:34:56.789Z");

    expect(new Date(inArgentinaTime(instant, FIXED_ARGENTINA_ZONE_RULES)).getTime()).toBe(
      instant.getTime(),
    );
  });

  it("refuses an instant that is not a date", () => {
    expect(() => inArgentinaTime(new Date("not a date"), FIXED_ARGENTINA_ZONE_RULES)).toThrow();
  });

  it("writes the clock time and the offset the rules give", () => {
    const instant = new Date("2026-09-30T12:00:00.000Z");

    expect(inArgentinaTime(instant, atOffset(-120))).toBe("2026-09-30T10:00:00.000-02:00");
    expect(inArgentinaTime(instant, atOffset(0))).toBe("2026-09-30T12:00:00.000+00:00");
    expect(inArgentinaTime(instant, atOffset(330))).toBe("2026-09-30T17:30:00.000+05:30");
  });

  it("changes offset at the instant a transition of the rules starts", () => {
    expect(inArgentinaTime(new Date("2030-03-01T02:59:59.000Z"), SUMMER_TIME)).toBe(
      "2030-02-28T23:59:59.000-03:00",
    );
    expect(inArgentinaTime(new Date("2030-03-01T03:00:00.000Z"), SUMMER_TIME)).toBe(
      "2030-03-01T01:00:00.000-02:00",
    );
  });
});

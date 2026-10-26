import { describe, expect, it } from "vitest";
import { FIXED_ARGENTINA_ZONE_RULES, offsetAt, type ZoneRules } from "./zone-rules.js";

const SUMMER_TIME: ZoneRules = {
  version: "2026a",
  transitions: [
    { from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: -180 },
    { from: new Date("2030-03-01T03:00:00Z"), offsetMinutes: -120 },
    { from: new Date("2030-10-01T02:00:00Z"), offsetMinutes: -180 },
  ],
};

describe("offsetAt", () => {
  it("is the offset of the last transition at or before the instant", () => {
    expect(offsetAt(SUMMER_TIME, new Date("2030-06-01T00:00:00Z"))).toBe(-120);
    expect(offsetAt(SUMMER_TIME, new Date("2031-01-01T00:00:00Z"))).toBe(-180);
  });

  it("applies a transition from the very instant it starts", () => {
    expect(offsetAt(SUMMER_TIME, new Date("2030-03-01T03:00:00Z"))).toBe(-120);
    expect(offsetAt(SUMMER_TIME, new Date("2030-03-01T02:59:59.999Z"))).toBe(-180);
  });

  it("uses the first transition's offset for an instant before all of them", () => {
    expect(offsetAt(SUMMER_TIME, new Date("1960-01-01T00:00:00Z"))).toBe(-180);
  });

  it("is the fixed UTC-3 for every instant under the rules a register applies before its first delivery", () => {
    expect(FIXED_ARGENTINA_ZONE_RULES.version).toBeNull();
    expect(offsetAt(FIXED_ARGENTINA_ZONE_RULES, new Date(-8.64e15))).toBe(-180);
    expect(offsetAt(FIXED_ARGENTINA_ZONE_RULES, new Date("2026-10-26T12:00:00Z"))).toBe(-180);
    expect(offsetAt(FIXED_ARGENTINA_ZONE_RULES, new Date(8.64e15))).toBe(-180);
  });
});

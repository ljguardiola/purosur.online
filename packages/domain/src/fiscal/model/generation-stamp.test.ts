import { describe, expect, it } from "vitest";
import { fixedOffsetZoneRules } from "../../shared/test-support/fake-zone-rules-source.js";
import { FIXED_ARGENTINA_ZONE_RULES } from "../../shared/zone-rules.js";
import { generationStampOf } from "./generation-stamp.js";

describe("generationStampOf", () => {
  it("writes the instant on Argentina's clock as yyyymmddhhmiss", () => {
    expect(
      generationStampOf(new Date("2026-03-05T14:07:09-03:00"), FIXED_ARGENTINA_ZONE_RULES),
    ).toBe("20260305140709");
  });

  it("keeps Argentina's day when UTC has already moved to the next one", () => {
    expect(
      generationStampOf(new Date("2026-09-26T01:59:59.000Z"), FIXED_ARGENTINA_ZONE_RULES),
    ).toBe("20260925225959");
  });

  it("reads midnight as 00 hours", () => {
    expect(
      generationStampOf(new Date("2026-09-26T00:00:00-03:00"), FIXED_ARGENTINA_ZONE_RULES),
    ).toBe("20260926000000");
  });

  it("drops the fraction of a second", () => {
    expect(
      generationStampOf(new Date("2026-09-26T00:00:00.999-03:00"), FIXED_ARGENTINA_ZONE_RULES),
    ).toBe("20260926000000");
  });

  it("reads the clock of the offset the rules give", () => {
    const at = new Date("2026-09-26T01:59:59.000Z");

    expect(generationStampOf(at, fixedOffsetZoneRules(-120))).toBe("20260925235959");
    expect(generationStampOf(at, fixedOffsetZoneRules(0))).toBe("20260926015959");
    expect(generationStampOf(at, fixedOffsetZoneRules(330))).toBe("20260926072959");
  });

  it("changes offset at the instant a transition starts", () => {
    const rules = {
      version: "2026a",
      transitions: [
        { from: new Date("1970-01-01T00:00:00Z"), offsetMinutes: -180 },
        { from: new Date("2030-03-01T03:00:00Z"), offsetMinutes: -120 },
      ],
    };

    expect(generationStampOf(new Date("2030-03-01T02:59:59Z"), rules)).toBe("20300228235959");
    expect(generationStampOf(new Date("2030-03-01T03:00:00Z"), rules)).toBe("20300301010000");
  });
});

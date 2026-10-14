import { FREIGHT_PERIOD_DAYS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { freightPeriodDaysSchema, freightPeriodSchema } from "./freight-period.js";

describe("freightPeriodDaysSchema", () => {
  it("offers exactly the periods a freight list may cover", () => {
    expect([...freightPeriodDaysSchema.values]).toEqual([...FREIGHT_PERIOD_DAYS]);
  });
});

describe("freightPeriodSchema", () => {
  it.each(FREIGHT_PERIOD_DAYS)("reads %i days from a number or its text", (days) => {
    expect(freightPeriodSchema.parse(days)).toBe(days);
    expect(freightPeriodSchema.parse(String(days))).toBe(days);
  });

  it("falls back to the last 90 days when no period is given", () => {
    expect(freightPeriodSchema.parse(undefined)).toBe(90);
  });

  it.each(["", "7", 31, "abc", "30.5", null])("rejects the period %j", (period) => {
    expect(freightPeriodSchema.safeParse(period).success).toBe(false);
  });
});

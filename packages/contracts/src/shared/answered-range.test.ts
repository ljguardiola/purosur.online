import { describe, expect, it } from "vitest";
import { answeredRangeSchema, calendarRangeSchema } from "./answered-range.js";

describe("answeredRangeSchema", () => {
  it("accepts the answered range with the day it was answered on", () => {
    const range = { from: "2026-09-01", to: "2026-09-30", today: "2026-10-15" };

    expect(answeredRangeSchema.parse(range)).toEqual(range);
  });

  it.each([
    ["no today", { from: "2026-09-01", to: "2026-09-30" }],
    ["a today that is not a calendar day", { from: "2026-09-01", to: "2026-09-30", today: "hoy" }],
    [
      "a bound that is not a calendar day",
      { from: "2026-02-30", to: "2026-09-30", today: "2026-10-15" },
    ],
  ])("refuses %s", (_name, range) => {
    expect(answeredRangeSchema.safeParse(range).success).toBe(false);
  });
});

describe("calendarRangeSchema", () => {
  it("accepts a range of calendar days", () => {
    expect(calendarRangeSchema.parse({ from: "2026-10-01", to: "2026-10-07" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-07",
    });
  });

  it("refuses a bound that is not a calendar day", () => {
    expect(calendarRangeSchema.safeParse({ from: "2026-10-01", to: "ayer" }).success).toBe(false);
  });
});

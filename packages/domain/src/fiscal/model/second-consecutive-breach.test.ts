import { describe, expect, it } from "vitest";
import { monthAtRiskOfSecondConsecutiveBreach } from "./second-consecutive-breach.js";

describe("monthAtRiskOfSecondConsecutiveBreach", () => {
  it("is the month in progress, put at risk by a breach recorded for the month before it", () => {
    expect(monthAtRiskOfSecondConsecutiveBreach("2026-03-15")).toEqual({
      month: "2026-03",
      previousMonth: "2026-02",
    });
  });

  it("follows the previous December in January", () => {
    expect(monthAtRiskOfSecondConsecutiveBreach("2027-01-01")).toEqual({
      month: "2027-01",
      previousMonth: "2026-12",
    });
  });

  it("follows the previous month from the last day of a long month", () => {
    expect(monthAtRiskOfSecondConsecutiveBreach("2026-03-31")).toEqual({
      month: "2026-03",
      previousMonth: "2026-02",
    });
  });
});

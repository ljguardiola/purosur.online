import { describe, expect, it } from "vitest";
import {
  BRANCH_HOURS_RANGES_PER_DAY_MAX,
  branchHoursRangesOverlap,
  isBranchHoursRangeOrdered,
  isBranchHoursTime,
} from "./branch-hours.js";

describe("BRANCH_HOURS_RANGES_PER_DAY_MAX", () => {
  it("caps a day's hours at 6 ranges", () => {
    expect(BRANCH_HOURS_RANGES_PER_DAY_MAX).toBe(6);
  });
});

describe("isBranchHoursTime", () => {
  it.each(["00:00", "09:05", "13:30", "23:59"])("accepts %s", (time) => {
    expect(isBranchHoursTime(time)).toBe(true);
  });

  it.each(["9:00", "24:00", "12:60", "12:5", "12-30", "12:30:00", " 12:30", ""])(
    "rejects %j",
    (time) => {
      expect(isBranchHoursTime(time)).toBe(false);
    },
  );
});

describe("isBranchHoursRangeOrdered", () => {
  it("accepts a range that closes later than it opens", () => {
    expect(isBranchHoursRangeOrdered({ opensAt: "09:00", closesAt: "13:00" })).toBe(true);
  });

  it("rejects a range that closes earlier than it opens", () => {
    expect(isBranchHoursRangeOrdered({ opensAt: "13:00", closesAt: "09:00" })).toBe(false);
  });

  it("rejects a range that closes when it opens", () => {
    expect(isBranchHoursRangeOrdered({ opensAt: "09:00", closesAt: "09:00" })).toBe(false);
  });
});

describe("branchHoursRangesOverlap", () => {
  it("is false for no ranges and for one", () => {
    expect(branchHoursRangesOverlap([])).toBe(false);
    expect(branchHoursRangesOverlap([{ opensAt: "09:00", closesAt: "13:00" }])).toBe(false);
  });

  it("is true for two ranges that share time, whatever order they come in", () => {
    const morning = { opensAt: "09:00", closesAt: "14:00" };
    const afternoon = { opensAt: "13:00", closesAt: "18:00" };

    expect(branchHoursRangesOverlap([morning, afternoon])).toBe(true);
    expect(branchHoursRangesOverlap([afternoon, morning])).toBe(true);
  });

  it("is false for two ranges where one closes when the other opens, whatever order they come in", () => {
    const morning = { opensAt: "09:00", closesAt: "13:00" };
    const afternoon = { opensAt: "13:00", closesAt: "17:00" };

    expect(branchHoursRangesOverlap([morning, afternoon])).toBe(false);
    expect(branchHoursRangesOverlap([afternoon, morning])).toBe(false);
  });

  it("finds an overlap between ranges that are not neighbours", () => {
    expect(
      branchHoursRangesOverlap([
        { opensAt: "08:00", closesAt: "20:00" },
        { opensAt: "21:00", closesAt: "22:00" },
        { opensAt: "10:00", closesAt: "11:00" },
      ]),
    ).toBe(true);
  });
});

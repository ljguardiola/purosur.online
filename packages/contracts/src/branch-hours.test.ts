import { describe, expect, it } from "vitest";
import { BRANCH_HOURS_RANGES_PER_DAY_MAX } from "./branch-hours.js";

describe("BRANCH_HOURS_RANGES_PER_DAY_MAX", () => {
  it("caps a day's hours at 6 ranges", () => {
    expect(BRANCH_HOURS_RANGES_PER_DAY_MAX).toBe(6);
  });
});

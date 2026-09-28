export const BRANCH_HOURS_RANGES_PER_DAY_MAX = 6;

type BranchHoursRange = { opensAt: string; closesAt: string };

const HOURS_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isBranchHoursTime(value: string): boolean {
  return HOURS_TIME_PATTERN.test(value);
}

// Zero-padded HH:MM strings compare lexicographically the same way the times they represent do.
export function isBranchHoursRangeOrdered(range: BranchHoursRange): boolean {
  return range.opensAt < range.closesAt;
}

export function branchHoursRangesOverlap(ranges: readonly BranchHoursRange[]): boolean {
  return ranges.some((a, index) =>
    ranges.slice(index + 1).some((b) => a.opensAt < b.closesAt && b.opensAt < a.closesAt),
  );
}

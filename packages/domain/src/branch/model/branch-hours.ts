import { argentinaCalendarDay, argentinaInstant } from "../../shared/index.js";

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

export interface BranchWeeklyHoursRange extends BranchHoursRange {
  dayOfWeek: number;
}

const MINUTE_MS = 60 * 1000;

function minutesOfDay(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Days are numbered 1 = Monday … 7 = Sunday; ranges of two days never join.
export function isSpanWithinBranchHours(
  span: { start: Date; end: Date },
  hours: readonly BranchWeeklyHoursRange[],
): boolean {
  const day = argentinaCalendarDay(span.start);
  if (argentinaCalendarDay(span.end) !== day) {
    return false;
  }
  const dayStart = new Date(argentinaInstant(day, "00:00")).getTime();
  const startMinute = (span.start.getTime() - dayStart) / MINUTE_MS;
  const endMinute = (span.end.getTime() - dayStart) / MINUTE_MS;
  const dayOfWeek = ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const ranges = hours
    .filter((range) => range.dayOfWeek === dayOfWeek)
    .map((range) => ({ opens: minutesOfDay(range.opensAt), closes: minutesOfDay(range.closesAt) }))
    .sort((a, b) => a.opens - b.opens);
  const joined: { opens: number; closes: number }[] = [];
  for (const range of ranges) {
    const last = joined.at(-1);
    if (last !== undefined && last.closes === range.opens) {
      last.closes = range.closes;
    } else {
      joined.push({ ...range });
    }
  }
  return joined.some((range) => range.opens <= startMinute && endMinute <= range.closes);
}

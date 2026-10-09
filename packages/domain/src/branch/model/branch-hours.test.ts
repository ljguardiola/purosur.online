import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { argentinaInstant } from "../../shared/index.js";
import {
  BRANCH_HOURS_RANGES_PER_DAY_MAX,
  branchHoursRangesOverlap,
  isBranchHoursRangeOrdered,
  isBranchHoursTime,
  isSpanWithinBranchHours,
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

const MONDAY = "2026-10-05";
const TUESDAY = "2026-10-06";

function argentina(day: string, time: string): Date {
  return new Date(argentinaInstant(day, time));
}

function weekdayHours(opensAt: string, closesAt: string) {
  return [{ dayOfWeek: 1, opensAt, closesAt }];
}

describe("isSpanWithinBranchHours", () => {
  const hours = weekdayHours("09:00", "18:00");

  it("is true for a span inside one range of the day", () => {
    expect(
      isSpanWithinBranchHours(
        { start: argentina(MONDAY, "10:00"), end: argentina(MONDAY, "10:15") },
        hours,
      ),
    ).toBe(true);
  });

  it("is true for a span that starts when the range opens and ends when it closes", () => {
    expect(
      isSpanWithinBranchHours(
        { start: argentina(MONDAY, "09:00"), end: argentina(MONDAY, "18:00") },
        hours,
      ),
    ).toBe(true);
  });

  it("is false for a span that starts a minute before the range opens", () => {
    expect(
      isSpanWithinBranchHours(
        { start: argentina(MONDAY, "08:59"), end: argentina(MONDAY, "09:14") },
        hours,
      ),
    ).toBe(false);
  });

  it("is false for a span that ends a minute after the range closes", () => {
    expect(
      isSpanWithinBranchHours(
        { start: argentina(MONDAY, "17:46"), end: argentina(MONDAY, "18:01") },
        hours,
      ),
    ).toBe(false);
  });

  it("is false for a span that ends a second after the range closes", () => {
    expect(
      isSpanWithinBranchHours(
        {
          start: argentina(MONDAY, "17:00"),
          end: new Date(argentina(MONDAY, "18:00").getTime() + 1000),
        },
        hours,
      ),
    ).toBe(false);
  });

  it("is false for a span on a day with no hours", () => {
    expect(
      isSpanWithinBranchHours(
        { start: argentina(TUESDAY, "10:00"), end: argentina(TUESDAY, "10:15") },
        hours,
      ),
    ).toBe(false);
  });

  it("is false for any span when the branch has no hours", () => {
    expect(
      isSpanWithinBranchHours(
        { start: argentina(MONDAY, "10:00"), end: argentina(MONDAY, "10:15") },
        [],
      ),
    ).toBe(false);
  });

  it("reads the hours of the day it falls on in Argentina, not in UTC", () => {
    const mondayEvening = weekdayHours("20:00", "23:00");

    expect(
      isSpanWithinBranchHours(
        { start: new Date("2026-10-06T01:00:00.000Z"), end: new Date("2026-10-06T01:15:00.000Z") },
        mondayEvening,
      ),
    ).toBe(true);
    expect(
      isSpanWithinBranchHours(
        { start: new Date("2026-10-05T20:00:00.000Z"), end: new Date("2026-10-05T20:15:00.000Z") },
        mondayEvening,
      ),
    ).toBe(false);
  });

  it("is false for a span that straddles the gap between two ranges", () => {
    const split = [
      { dayOfWeek: 1, opensAt: "09:00", closesAt: "13:00" },
      { dayOfWeek: 1, opensAt: "16:00", closesAt: "20:00" },
    ];

    expect(
      isSpanWithinBranchHours(
        { start: argentina(MONDAY, "12:50"), end: argentina(MONDAY, "16:05") },
        split,
      ),
    ).toBe(false);
  });

  it("joins two ranges where one closes at the minute the next opens, whatever order they come in", () => {
    const morning = { dayOfWeek: 1, opensAt: "09:00", closesAt: "13:00" };
    const afternoon = { dayOfWeek: 1, opensAt: "13:00", closesAt: "18:00" };
    const span = { start: argentina(MONDAY, "12:50"), end: argentina(MONDAY, "13:05") };

    expect(isSpanWithinBranchHours(span, [morning, afternoon])).toBe(true);
    expect(isSpanWithinBranchHours(span, [afternoon, morning])).toBe(true);
  });

  it("joins a chain of adjacent ranges", () => {
    const chain = [
      { dayOfWeek: 1, opensAt: "09:00", closesAt: "10:00" },
      { dayOfWeek: 1, opensAt: "12:00", closesAt: "14:00" },
      { dayOfWeek: 1, opensAt: "10:00", closesAt: "12:00" },
    ];

    expect(
      isSpanWithinBranchHours(
        { start: argentina(MONDAY, "09:30"), end: argentina(MONDAY, "13:30") },
        chain,
      ),
    ).toBe(true);
  });

  it("does not join a range of one day with a range of the next", () => {
    const nights = [
      { dayOfWeek: 1, opensAt: "18:00", closesAt: "23:59" },
      { dayOfWeek: 2, opensAt: "00:00", closesAt: "06:00" },
    ];

    expect(
      isSpanWithinBranchHours(
        { start: argentina(MONDAY, "23:50"), end: argentina(TUESDAY, "00:05") },
        nights,
      ),
    ).toBe(false);
  });

  it("uses the hours of Sunday for a Sunday", () => {
    expect(
      isSpanWithinBranchHours(
        { start: argentina("2026-10-11", "10:00"), end: argentina("2026-10-11", "10:15") },
        [{ dayOfWeek: 7, opensAt: "09:00", closesAt: "13:00" }],
      ),
    ).toBe(true);
  });

  const minuteOfDay = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  const weekDay = fc.integer({ min: 0, max: 6 });
  const dayOf = (index: number) => `2026-10-${String(5 + index).padStart(2, "0")}`;
  const range = fc
    .tuple(fc.integer({ min: 0, max: 1437 }), fc.integer({ min: 1, max: 1439 }))
    .filter(([opens, closes]) => opens < closes);

  it("holds for every span that lies between a range's opening and closing", () => {
    fc.assert(
      fc.property(weekDay, range, fc.nat(), fc.nat(), (index, [opens, closes], first, second) => {
        const start = opens + (first % (closes - opens + 1));
        const end = start + (second % (closes - start + 1));
        return isSpanWithinBranchHours(
          {
            start: argentina(dayOf(index), minuteOfDay(start)),
            end: argentina(dayOf(index), minuteOfDay(end)),
          },
          [{ dayOfWeek: index + 1, opensAt: minuteOfDay(opens), closesAt: minuteOfDay(closes) }],
        );
      }),
    );
  });

  it("fails for every span that starts before the only range of its day opens", () => {
    fc.assert(
      fc.property(
        weekDay,
        range.filter(([opens]) => opens > 0),
        fc.nat(),
        fc.nat(),
        (index, [opens, closes], first, second) => {
          const start = first % opens;
          const end = start + (second % (closes - start + 1));
          return !isSpanWithinBranchHours(
            {
              start: argentina(dayOf(index), minuteOfDay(start)),
              end: argentina(dayOf(index), minuteOfDay(end)),
            },
            [{ dayOfWeek: index + 1, opensAt: minuteOfDay(opens), closesAt: minuteOfDay(closes) }],
          );
        },
      ),
    );
  });

  it("fails for every span that ends after the only range of its day closes", () => {
    fc.assert(
      fc.property(
        weekDay,
        range.filter(([, closes]) => closes < 1439),
        fc.nat(),
        fc.nat(),
        (index, [opens, closes], first, second) => {
          const end = closes + 1 + (first % (1439 - closes));
          const start = second % (end + 1);
          return !isSpanWithinBranchHours(
            {
              start: argentina(dayOf(index), minuteOfDay(start)),
              end: argentina(dayOf(index), minuteOfDay(end)),
            },
            [{ dayOfWeek: index + 1, opensAt: minuteOfDay(opens), closesAt: minuteOfDay(closes) }],
          );
        },
      ),
    );
  });

  it("fails for every span on a day whose hours are other days'", () => {
    fc.assert(
      fc.property(weekDay, weekDay, range, (index, otherIndex, [opens, closes]) => {
        fc.pre(index !== otherIndex);
        return !isSpanWithinBranchHours(
          {
            start: argentina(dayOf(index), minuteOfDay(opens)),
            end: argentina(dayOf(index), minuteOfDay(closes)),
          },
          [
            {
              dayOfWeek: otherIndex + 1,
              opensAt: minuteOfDay(opens),
              closesAt: minuteOfDay(closes),
            },
          ],
        );
      }),
    );
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  chargeRefusal,
  isBuyerIdentificationThresholdAmount,
  isLowerThanInEffect,
  startsFromToday,
  thresholdInEffectOn,
  thresholdScheduledAfter,
} from "./buyer-identification-threshold.js";

const first = { id: "t1", amount: 1_000_000, validFrom: "2026-01-01", revision: 0 };
const second = { id: "t2", amount: 2_000_000, validFrom: "2026-06-01", revision: 0 };
const third = { id: "t3", amount: 3_000_000, validFrom: "2026-09-01", revision: 0 };

describe("isBuyerIdentificationThresholdAmount", () => {
  it.each([1, 100, Number.MAX_SAFE_INTEGER])("accepts %s cents", (amount) => {
    expect(isBuyerIdentificationThresholdAmount(amount)).toBe(true);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["beyond a safe integer", Number.MAX_SAFE_INTEGER + 1],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("refuses an amount that is %s", (_case, amount) => {
    expect(isBuyerIdentificationThresholdAmount(amount)).toBe(false);
  });
});

describe("startsFromToday", () => {
  it.each([
    ["today", "2026-06-01"],
    ["a later day", "2026-06-02"],
    ["a day in another year", "2027-01-01"],
  ])("accepts %s", (_case, day) => {
    expect(startsFromToday(day, "2026-06-01")).toBe(true);
  });

  it.each([
    ["the day before", "2026-05-31"],
    ["a day in an earlier year", "2025-12-31"],
  ])("refuses %s", (_case, day) => {
    expect(startsFromToday(day, "2026-06-01")).toBe(false);
  });
});

describe("isLowerThanInEffect", () => {
  it("is true for an amount below the one in effect", () => {
    expect(isLowerThanInEffect(1_999_999, second)).toBe(true);
  });

  it.each([
    ["equal to", 2_000_000],
    ["above", 2_000_001],
  ])("is false for an amount %s the one in effect", (_case, amount) => {
    expect(isLowerThanInEffect(amount, second)).toBe(false);
  });

  it("is false when no threshold is in effect", () => {
    expect(isLowerThanInEffect(1, undefined)).toBe(false);
  });
});

describe("thresholdInEffectOn", () => {
  it("answers nothing when no threshold exists", () => {
    expect(thresholdInEffectOn([], "2026-07-01")).toBeUndefined();
  });

  it("answers nothing before the first threshold starts", () => {
    expect(thresholdInEffectOn([first, second], "2025-12-31")).toBeUndefined();
  });

  it("answers the threshold that starts that very day", () => {
    expect(thresholdInEffectOn([first, second], "2026-06-01")).toEqual(second);
  });

  it("answers the latest threshold that has started, whatever the order of the list", () => {
    expect(thresholdInEffectOn([third, first, second], "2026-07-15")).toEqual(second);
  });

  it("keeps answering the last threshold long after it started", () => {
    expect(thresholdInEffectOn([first, second], "2030-01-01")).toEqual(second);
  });
});

describe("thresholdInEffectOn with replacements", () => {
  const replaced = { id: "r0", amount: 10_000, validFrom: "2026-06-01", revision: 0 };
  const replacement = { id: "r1", amount: 10_000_000, validFrom: "2026-06-01", revision: 1 };
  const replacedAgain = { id: "r2", amount: 9_000_000, validFrom: "2026-06-01", revision: 2 };

  it("answers the highest revision of the day it starts, whatever the order of the list", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([replaced, replacement, replacedAgain], { minLength: 3 }),
        (list) => {
          expect(thresholdInEffectOn([first, ...list], "2026-06-01")).toEqual(replacedAgain);
        },
      ),
    );
  });

  it("prefers the later day over a higher revision of an earlier day", () => {
    const earlierDayRevised = { id: "e1", amount: 5, validFrom: "2026-05-01", revision: 7 };

    expect(thresholdInEffectOn([earlierDayRevised, replaced], "2026-06-01")).toEqual(replaced);
  });
});

describe("thresholdScheduledAfter with replacements", () => {
  const replaced = { id: "r0", amount: 10_000, validFrom: "2026-09-01", revision: 0 };
  const replacement = { id: "r1", amount: 10_000_000, validFrom: "2026-09-01", revision: 1 };
  const afterThem = { id: "r9", amount: 4_000_000, validFrom: "2026-10-01", revision: 5 };

  it("answers the highest revision of the next day to start, whatever the order", () => {
    fc.assert(
      fc.property(fc.shuffledSubarray([replaced, replacement, afterThem], { minLength: 3 }), (list) => {
        expect(thresholdScheduledAfter(list, "2026-08-01")).toEqual(replacement);
      }),
    );
  });
});

describe("thresholdScheduledAfter", () => {
  it("answers nothing when every threshold has started", () => {
    expect(thresholdScheduledAfter([first, second], "2026-06-01")).toBeUndefined();
  });

  it("answers nothing when no threshold exists", () => {
    expect(thresholdScheduledAfter([], "2026-06-01")).toBeUndefined();
  });

  it("answers the threshold that starts after that day", () => {
    expect(thresholdScheduledAfter([first, second], "2026-05-31")).toEqual(second);
  });

  it("answers the next one to start when several are scheduled, whatever the order of the list", () => {
    expect(thresholdScheduledAfter([third, second, first], "2026-03-01")).toEqual(second);
  });
});

describe("chargeRefusal", () => {
  const thresholds = [first, second, third];
  const noon = (day: string) => new Date(`${day}T15:00:00.000Z`);
  const reaches = (threshold: number) => ({
    kind: "reaches_buyer_identification_threshold",
    threshold,
  });

  it("lets an amount below the threshold in effect be charged", () => {
    expect(chargeRefusal(1_999_999, thresholds, noon("2026-07-01"))).toBeUndefined();
  });

  it("refuses an amount equal to the threshold in effect, naming it", () => {
    expect(chargeRefusal(2_000_000, thresholds, noon("2026-07-01"))).toEqual(reaches(2_000_000));
  });

  it("refuses an amount above the threshold in effect, naming it", () => {
    expect(chargeRefusal(2_000_001, thresholds, noon("2026-07-01"))).toEqual(reaches(2_000_000));
  });

  it("applies a threshold on the Argentine day it starts", () => {
    expect(chargeRefusal(1_500_000, thresholds, noon("2026-06-01"))).toBeUndefined();
    expect(chargeRefusal(1_500_000, thresholds, noon("2026-05-31"))).toEqual(reaches(1_000_000));
  });

  it("reads the Argentine day, not the UTC one, late at night UTC", () => {
    const stillMay = new Date("2026-06-01T02:59:59.000Z");
    const alreadyJune = new Date("2026-06-01T03:00:00.000Z");

    expect(chargeRefusal(1_500_000, thresholds, stillMay)).toEqual(reaches(1_000_000));
    expect(chargeRefusal(1_500_000, thresholds, alreadyJune)).toBeUndefined();
  });

  it("ignores a threshold that has not started", () => {
    expect(chargeRefusal(2_500_000, thresholds, noon("2026-08-31"))).toEqual(reaches(2_000_000));
    expect(chargeRefusal(2_500_000, thresholds, noon("2026-09-01"))).toBeUndefined();
  });

  it("refuses every amount when there are no thresholds", () => {
    expect(chargeRefusal(1, [], noon("2026-07-01"))).toEqual({
      kind: "no_buyer_identification_threshold",
    });
  });

  it("refuses every amount when every threshold is still in the future", () => {
    expect(chargeRefusal(1, thresholds, noon("2025-12-31"))).toEqual({
      kind: "no_buyer_identification_threshold",
    });
  });

  it("refuses exactly the amounts that reach the threshold in effect", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 0, max: 20_000_000 }),
        (limit, amount) => {
          const only = [{ id: "t", amount: limit, validFrom: "2026-01-01", revision: 0 }];

          expect(chargeRefusal(amount, only, noon("2026-07-01"))).toEqual(
            amount >= limit ? reaches(limit) : undefined,
          );
        },
      ),
    );
  });
});

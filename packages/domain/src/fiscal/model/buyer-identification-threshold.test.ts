import { describe, expect, it } from "vitest";
import {
  isBuyerIdentificationThresholdAmount,
  latestThreshold,
  startsAfterLatestThreshold,
  thresholdInEffectOn,
  thresholdScheduledAfter,
} from "./buyer-identification-threshold.js";

const first = { id: "t1", amount: 1_000_000, validFrom: "2026-01-01" };
const second = { id: "t2", amount: 2_000_000, validFrom: "2026-06-01" };
const third = { id: "t3", amount: 3_000_000, validFrom: "2026-09-01" };

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

describe("startsAfterLatestThreshold", () => {
  it("accepts any day when no threshold exists", () => {
    expect(startsAfterLatestThreshold("2020-01-01", undefined)).toBe(true);
  });

  it("accepts a day after the latest threshold's", () => {
    expect(startsAfterLatestThreshold("2026-06-02", second)).toBe(true);
  });

  it.each([
    ["the same day", "2026-06-01"],
    ["an earlier day", "2026-05-31"],
  ])("refuses %s as the latest threshold's", (_case, day) => {
    expect(startsAfterLatestThreshold(day, second)).toBe(false);
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

describe("latestThreshold", () => {
  it("answers nothing when no threshold exists", () => {
    expect(latestThreshold([])).toBeUndefined();
  });

  it("answers the threshold that starts last, whatever the order of the list", () => {
    expect(latestThreshold([second, third, first])).toEqual(third);
  });
});

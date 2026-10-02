import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DISCOUNT_STATUSES, discountStatus, isDiscountLive } from "./discount-status.js";

describe("DISCOUNT_STATUSES", () => {
  it("lists the states a discount can be in", () => {
    expect(DISCOUNT_STATUSES).toEqual(["current", "scheduled", "ended", "deactivated"]);
  });
});

const window = { validFrom: "2026-09-12", validTo: "2026-09-30" };

describe("discountStatus", () => {
  it("is scheduled before the start day", () => {
    expect(discountStatus({ active: true, ...window }, "2026-09-11")).toBe("scheduled");
  });

  it("is current on the start day", () => {
    expect(discountStatus({ active: true, ...window }, "2026-09-12")).toBe("current");
  });

  it("is current in the middle of the window", () => {
    expect(discountStatus({ active: true, ...window }, "2026-09-20")).toBe("current");
  });

  it("is current on the end day", () => {
    expect(discountStatus({ active: true, ...window }, "2026-09-30")).toBe("current");
  });

  it("is ended after the end day", () => {
    expect(discountStatus({ active: true, ...window }, "2026-10-01")).toBe("ended");
  });

  it.each(["2026-09-11", "2026-09-20", "2026-10-01"])(
    "is deactivated on %s whatever its dates say",
    (today) => {
      expect(discountStatus({ active: false, ...window }, today)).toBe("deactivated");
    },
  );

  it("follows the day's position against the window, for any window and day", () => {
    const day = fc.integer({ min: 0, max: 60_000 });
    fc.assert(
      fc.property(day, day, day, (a, b, today) => {
        const [start = 0, end = 0] = [a, b].sort((x, y) => x - y);
        const iso = (number: number) => new Date(number * 86_400_000).toISOString().slice(0, 10);
        const expected = today < start ? "scheduled" : today > end ? "ended" : "current";
        expect(
          discountStatus({ active: true, validFrom: iso(start), validTo: iso(end) }, iso(today)),
        ).toBe(expected);
      }),
    );
  });
});

describe("isDiscountLive", () => {
  it.each([
    ["2026-09-11", true],
    ["2026-09-12", true],
    ["2026-09-30", true],
    ["2026-10-01", false],
  ])("for an active discount on %s is %s", (today, expected) => {
    expect(isDiscountLive({ active: true, ...window }, today)).toBe(expected);
  });

  it("is false for a deactivated discount whatever its dates say", () => {
    expect(isDiscountLive({ active: false, ...window }, "2026-09-20")).toBe(false);
  });
});

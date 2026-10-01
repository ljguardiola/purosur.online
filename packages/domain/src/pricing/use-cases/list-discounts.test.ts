import { describe, expect, it } from "vitest";
import type { StoredDiscount } from "./discount-reader.js";
import { listDiscounts } from "./list-discounts.js";
import { fakeDiscountReader } from "./test-support/fake-discount-reader.js";

function stored(overrides: Partial<StoredDiscount> = {}): StoredDiscount {
  return {
    id: "discount-1",
    name: "Verano",
    benefit: { kind: "PERCENT_OFF", percent: 15 },
    target: { kind: "PRODUCT", id: "product-1", name: "Yerba mate" },
    validFrom: "2026-12-01",
    validTo: "2027-02-28",
    weekdays: [],
    active: true,
    version: 3,
    ...overrides,
  };
}

const clockAt = (instant: string) => ({ now: () => new Date(instant) });

describe("listDiscounts", () => {
  it("lists nothing when there are no discounts", async () => {
    const listed = await listDiscounts({
      discounts: fakeDiscountReader([]),
      clock: clockAt("2026-12-15T15:00:00Z"),
    });

    expect(listed).toEqual([]);
  });

  it("lists every discount as it was read, in the order it was read, with its status", async () => {
    const listed = await listDiscounts({
      discounts: fakeDiscountReader([
        stored({ id: "b", name: "B" }),
        stored({ id: "a", name: "A", active: false }),
      ]),
      clock: clockAt("2026-12-15T15:00:00Z"),
    });

    expect(listed).toEqual([
      { ...stored({ id: "b", name: "B" }), status: "current" },
      { ...stored({ id: "a", name: "A", active: false }), status: "deactivated" },
    ]);
  });

  it("gives each discount its status on Argentina's calendar day, not the UTC day", async () => {
    const discounts = fakeDiscountReader([stored({ validFrom: "2026-12-15", validTo: "2026-12-15" })]);

    const lateEvening = await listDiscounts({ discounts, clock: clockAt("2026-12-16T01:00:00Z") });
    const nextMorning = await listDiscounts({ discounts, clock: clockAt("2026-12-16T03:00:00Z") });

    expect(lateEvening[0]?.status).toBe("current");
    expect(nextMorning[0]?.status).toBe("ended");
  });

  it("marks a discount that has not started as scheduled", async () => {
    const listed = await listDiscounts({
      discounts: fakeDiscountReader([stored()]),
      clock: clockAt("2026-11-30T15:00:00Z"),
    });

    expect(listed[0]?.status).toBe("scheduled");
  });

  it("lists the weekdays of a discount in ascending order", async () => {
    const listed = await listDiscounts({
      discounts: fakeDiscountReader([stored({ weekdays: [5, 1, 3] })]),
      clock: clockAt("2026-12-15T15:00:00Z"),
    });

    expect(listed[0]?.weekdays).toEqual([1, 3, 5]);
  });
});

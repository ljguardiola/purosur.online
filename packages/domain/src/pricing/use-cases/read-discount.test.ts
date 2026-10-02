import { describe, expect, it } from "vitest";
import type { StoredDiscount } from "./discount-reader.js";
import { readDiscount } from "./read-discount.js";
import { fakeDiscountReader } from "./test-support/fake-discount-reader.js";

const stored: StoredDiscount = {
  id: "discount-1",
  name: "Verano",
  benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
  target: { kind: "TAG", id: "tag-1", name: "Sin TACC" },
  validFrom: "2026-12-01",
  validTo: "2027-02-28",
  weekdays: [6, 2],
  active: true,
  version: 3,
};

const clock = { now: () => new Date("2027-03-01T15:00:00Z") };

describe("readDiscount", () => {
  it("reads a discount with its status and its weekdays in ascending order", async () => {
    const outcome = await readDiscount(
      { discounts: fakeDiscountReader([stored]), clock },
      "discount-1",
    );

    expect(outcome).toEqual({
      kind: "found",
      discount: { ...stored, weekdays: [2, 6], status: "ended" },
    });
  });

  it("reads only the discount asked for", async () => {
    const other = { ...stored, id: "discount-2", name: "Otoño" };

    const outcome = await readDiscount(
      { discounts: fakeDiscountReader([stored, other]), clock },
      "discount-2",
    );

    expect(outcome).toMatchObject({ kind: "found", discount: { id: "discount-2", name: "Otoño" } });
  });

  it("reports a discount that does not exist as not found", async () => {
    const outcome = await readDiscount(
      { discounts: fakeDiscountReader([stored]), clock },
      "missing",
    );

    expect(outcome).toEqual({ kind: "not_found" });
  });
});

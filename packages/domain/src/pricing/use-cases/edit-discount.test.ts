import { describe, expect, it } from "vitest";
import type { EditDiscountInput } from "./edit-discount.js";
import { editDiscount } from "./edit-discount.js";
import type { FakeDiscountRow } from "./test-support/fake-discount-store.js";
import { FakeDiscountStore } from "./test-support/fake-discount-store.js";

const stored: FakeDiscountRow = {
  id: "discount-1",
  name: "Verano",
  benefit: { kind: "PERCENT_OFF", percent: 15 },
  target: { kind: "PRODUCT", id: "product-1" },
  validFrom: "2026-12-01",
  validTo: "2027-02-28",
  weekdays: [],
  active: true,
  version: 3,
};

const input: EditDiscountInput = {
  id: "discount-1",
  version: 3,
  name: "Verano",
  benefit: { kind: "PERCENT_OFF", percent: 15 },
  target: { kind: "PRODUCT", id: "product-1" },
  validFrom: "2026-12-01",
  validTo: "2027-02-28",
  weekdays: [],
  active: true,
};

const buyThreePayTwo = { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } as const;

function seededStore(productActive = true, saleUnit: "UNIT" | "KG" = "UNIT") {
  const store = new FakeDiscountStore();
  store.seedTarget({ kind: "PRODUCT", id: "product-1", active: productActive, saleUnit });
  store.seedTarget({ kind: "PRODUCT", id: "weighed-1", active: true, saleUnit: "KG" });
  store.seedTarget({ kind: "PRODUCT", id: "unit-2", active: true, saleUnit: "UNIT" });
  store.seedTarget({ kind: "CATEGORY", id: "category-1", active: true });
  store.seedTarget({ kind: "TAG", id: "tag-1", active: false });
  store.seedDiscount(stored);
  return store;
}

function storeWithBuyNPayMOn(saleUnit: "UNIT" | "KG") {
  const store = new FakeDiscountStore();
  store.seedTarget({ kind: "PRODUCT", id: "product-1", active: true, saleUnit });
  store.seedTarget({ kind: "PRODUCT", id: "weighed-1", active: true, saleUnit: "KG" });
  store.seedTarget({ kind: "PRODUCT", id: "unit-2", active: true, saleUnit: "UNIT" });
  store.seedDiscount({ ...stored, benefit: buyThreePayTwo });
  return store;
}

describe("editDiscount", () => {
  it("answers not_found for a discount that does not exist", async () => {
    const store = seededStore();

    const outcome = await editDiscount({ store }, { ...input, id: "missing" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.operationOrder).toEqual(["lockDiscount"]);
  });

  it("refuses a stale version, writing nothing", async () => {
    const store = seededStore();

    const outcome = await editDiscount({ store }, { ...input, version: 2, name: "Otoño" });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot().discounts).toEqual([stored]);
    expect(store.operationOrder).toEqual(["lockDiscount"]);
  });

  it("applies every field and bumps the version", async () => {
    const store = seededStore();

    const outcome = await editDiscount(
      { store },
      {
        ...input,
        name: "Otoño",
        benefit: { kind: "PERCENT_OFF", percent: 30 },
        validFrom: "2027-03-01",
        validTo: "2027-05-31",
        weekdays: [6, 7],
        active: false,
      },
    );

    expect(outcome).toEqual({ kind: "applied", version: 4 });
    expect(store.snapshot().discounts).toEqual([
      {
        ...stored,
        name: "Otoño",
        benefit: { kind: "PERCENT_OFF", percent: 30 },
        validFrom: "2027-03-01",
        validTo: "2027-05-31",
        weekdays: [6, 7],
        active: false,
        version: 4,
      },
    ]);
  });

  it("stores the weekdays sorted", async () => {
    const store = seededStore();

    await editDiscount({ store }, { ...input, weekdays: [5, 1, 3] });

    expect(store.snapshot().discounts[0]?.weekdays).toEqual([1, 3, 5]);
  });

  it("switches a discount on again", async () => {
    const store = new FakeDiscountStore();
    store.seedTarget({ kind: "PRODUCT", id: "product-1", active: true });
    store.seedDiscount({ ...stored, active: false });

    const outcome = await editDiscount({ store }, { ...input, active: true });

    expect(outcome).toEqual({ kind: "applied", version: 4 });
    expect(store.snapshot().discounts[0]?.active).toBe(true);
  });

  it("does not check the target when it did not change, so a discount on a since-deactivated product can still be renamed", async () => {
    const store = seededStore(false);

    const outcome = await editDiscount({ store }, { ...input, name: "Otoño" });

    expect(outcome).toEqual({ kind: "applied", version: 4 });
    expect(store.operationOrder).toEqual(["lockDiscount", "updateDiscount"]);
  });

  it("locks the discount, then the new target, then writes", async () => {
    const store = seededStore();

    const outcome = await editDiscount(
      { store },
      { ...input, target: { kind: "CATEGORY", id: "category-1" } },
    );

    expect(outcome).toEqual({ kind: "applied", version: 4 });
    expect(store.snapshot().discounts[0]?.target).toEqual({ kind: "CATEGORY", id: "category-1" });
    expect(store.operationOrder).toEqual([
      "lockDiscount",
      "lockAssignableTarget",
      "updateDiscount",
    ]);
  });

  it("checks the target when only its kind changed", async () => {
    const store = seededStore();
    store.seedTarget({ kind: "TAG", id: "product-1", active: true });

    const outcome = await editDiscount(
      { store },
      { ...input, target: { kind: "TAG", id: "product-1" } },
    );

    expect(outcome.kind).toBe("applied");
    expect(store.operationOrder).toContain("lockAssignableTarget");
  });

  it("checks the target when only its id changed", async () => {
    const store = seededStore();

    const outcome = await editDiscount(
      { store },
      { ...input, target: { kind: "PRODUCT", id: "product-2" } },
    );

    expect(outcome).toEqual({ kind: "target_not_found" });
  });

  it("refuses a new target that is deactivated, writing nothing", async () => {
    const store = seededStore();

    const outcome = await editDiscount(
      { store },
      { ...input, target: { kind: "TAG", id: "tag-1" }, name: "Otoño" },
    );

    expect(outcome).toEqual({ kind: "target_not_found" });
    expect(store.snapshot().discounts).toEqual([stored]);
    expect(store.operationOrder).toEqual(["lockDiscount", "lockAssignableTarget"]);
  });

  describe("buy-N-pay-M", () => {
    it("switches a percentage discount to buy-N-pay-M on its product sold by the unit, checking the product", async () => {
      const store = seededStore();

      const outcome = await editDiscount({ store }, { ...input, benefit: buyThreePayTwo });

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.snapshot().discounts[0]?.benefit).toEqual(buyThreePayTwo);
      expect(store.operationOrder).toEqual([
        "lockDiscount",
        "lockAssignableTarget",
        "updateDiscount",
      ]);
    });

    it("refuses switching to buy-N-pay-M on a product sold by weight, writing nothing", async () => {
      const store = seededStore(true, "KG");

      const outcome = await editDiscount({ store }, { ...input, benefit: buyThreePayTwo });

      expect(outcome).toEqual({ kind: "target_not_sold_by_unit" });
      expect(store.snapshot().discounts).toEqual([stored]);
      expect(store.operationOrder).toEqual(["lockDiscount", "lockAssignableTarget"]);
    });

    it("refuses moving a buy-N-pay-M discount to a product sold by weight", async () => {
      const store = storeWithBuyNPayMOn("UNIT");

      const outcome = await editDiscount(
        { store },
        { ...input, benefit: buyThreePayTwo, target: { kind: "PRODUCT", id: "weighed-1" } },
      );

      expect(outcome).toEqual({ kind: "target_not_sold_by_unit" });
      expect(store.snapshot().discounts[0]?.target).toEqual({ kind: "PRODUCT", id: "product-1" });
    });

    it("refuses moving a buy-N-pay-M discount to a category", async () => {
      const store = storeWithBuyNPayMOn("UNIT");
      store.seedTarget({ kind: "CATEGORY", id: "category-1", active: true });

      const outcome = await editDiscount(
        { store },
        { ...input, benefit: buyThreePayTwo, target: { kind: "CATEGORY", id: "category-1" } },
      );

      expect(outcome).toEqual({ kind: "target_not_sold_by_unit" });
    });

    it("moves a buy-N-pay-M discount to another product sold by the unit", async () => {
      const store = storeWithBuyNPayMOn("UNIT");

      const outcome = await editDiscount(
        { store },
        { ...input, benefit: buyThreePayTwo, target: { kind: "PRODUCT", id: "unit-2" } },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.snapshot().discounts[0]?.target).toEqual({ kind: "PRODUCT", id: "unit-2" });
    });

    it("changes the quantities without checking the product it already applies to", async () => {
      const store = storeWithBuyNPayMOn("UNIT");

      const outcome = await editDiscount(
        { store },
        { ...input, benefit: { kind: "BUY_N_PAY_M", buyQty: 4, payQty: 3 } },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.snapshot().discounts[0]?.benefit).toEqual({
        kind: "BUY_N_PAY_M",
        buyQty: 4,
        payQty: 3,
      });
      expect(store.operationOrder).toEqual(["lockDiscount", "updateDiscount"]);
    });

    it("switches a buy-N-pay-M discount to a percentage on a product sold by weight", async () => {
      const store = storeWithBuyNPayMOn("KG");

      const outcome = await editDiscount(
        { store },
        { ...input, target: { kind: "PRODUCT", id: "weighed-1" } },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
    });

    it("answers target_not_found when switching to buy-N-pay-M on a since-deactivated product", async () => {
      const store = seededStore(false);

      const outcome = await editDiscount({ store }, { ...input, benefit: buyThreePayTwo });

      expect(outcome).toEqual({ kind: "target_not_found" });
    });
  });

  it("leaves the discount as it was when the write fails", async () => {
    const store = seededStore();
    store.failingWrites.add("updateDiscount");

    await expect(editDiscount({ store }, { ...input, name: "Otoño" })).rejects.toThrow(
      "updateDiscount failed",
    );

    expect(store.snapshot().discounts).toEqual([stored]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = seededStore();

    await editDiscount({ store }, input);

    expect(store.transactionCount).toBe(1);
  });
});

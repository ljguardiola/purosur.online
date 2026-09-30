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

const clock = { now: () => new Date("2026-12-15T15:00:00Z") };

const buyThreePayTwo = { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 } as const;

function storeWithSwitchedOffBuyNPayM(
  saleUnit: "UNIT" | "KG",
  overrides: Partial<FakeDiscountRow> = {},
) {
  const store = new FakeDiscountStore();
  store.seedTarget({ kind: "PRODUCT", id: "product-1", name: "Yerba", active: true, saleUnit });
  store.seedDiscount({ ...stored, benefit: buyThreePayTwo, active: false, ...overrides });
  return store;
}

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

    const outcome = await editDiscount({ store, clock }, { ...input, id: "missing" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.operationOrder).toEqual(["lockDiscount"]);
  });

  it("refuses a stale version, writing nothing", async () => {
    const store = seededStore();

    const outcome = await editDiscount({ store, clock }, { ...input, version: 2, name: "Otoño" });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot().discounts).toEqual([stored]);
    expect(store.operationOrder).toEqual(["lockDiscount"]);
  });

  it("applies every field and bumps the version", async () => {
    const store = seededStore();

    const outcome = await editDiscount(
      { store, clock },
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

    await editDiscount({ store, clock }, { ...input, weekdays: [5, 1, 3] });

    expect(store.snapshot().discounts[0]?.weekdays).toEqual([1, 3, 5]);
  });

  it("switches a discount on again", async () => {
    const store = new FakeDiscountStore();
    store.seedTarget({ kind: "PRODUCT", id: "product-1", active: true });
    store.seedDiscount({ ...stored, active: false });

    const outcome = await editDiscount({ store, clock }, { ...input, active: true });

    expect(outcome).toEqual({ kind: "applied", version: 4 });
    expect(store.snapshot().discounts[0]?.active).toBe(true);
  });

  it("does not check the target when it did not change, so a discount on a since-deactivated product can still be renamed", async () => {
    const store = seededStore(false);

    const outcome = await editDiscount({ store, clock }, { ...input, name: "Otoño" });

    expect(outcome).toEqual({ kind: "applied", version: 4 });
    expect(store.operationOrder).toEqual(["lockDiscount", "updateDiscount"]);
  });

  it("locks the discount, then the new target, then writes", async () => {
    const store = seededStore();

    const outcome = await editDiscount(
      { store, clock },
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
      { store, clock },
      { ...input, target: { kind: "TAG", id: "product-1" } },
    );

    expect(outcome.kind).toBe("applied");
    expect(store.operationOrder).toContain("lockAssignableTarget");
  });

  it("checks the target when only its id changed", async () => {
    const store = seededStore();

    const outcome = await editDiscount(
      { store, clock },
      { ...input, target: { kind: "PRODUCT", id: "product-2" } },
    );

    expect(outcome).toEqual({ kind: "target_not_found" });
  });

  it("refuses a new target that is deactivated, writing nothing", async () => {
    const store = seededStore();

    const outcome = await editDiscount(
      { store, clock },
      { ...input, target: { kind: "TAG", id: "tag-1" }, name: "Otoño" },
    );

    expect(outcome).toEqual({ kind: "target_not_found" });
    expect(store.snapshot().discounts).toEqual([stored]);
    expect(store.operationOrder).toEqual(["lockDiscount", "lockAssignableTarget"]);
  });

  describe("buy-N-pay-M", () => {
    it("switches a percentage discount to buy-N-pay-M on its product sold by the unit, checking the product", async () => {
      const store = seededStore();

      const outcome = await editDiscount({ store, clock }, { ...input, benefit: buyThreePayTwo });

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

      const outcome = await editDiscount({ store, clock }, { ...input, benefit: buyThreePayTwo });

      expect(outcome).toEqual({ kind: "target_not_sold_by_unit" });
      expect(store.snapshot().discounts).toEqual([stored]);
      expect(store.operationOrder).toEqual(["lockDiscount", "lockAssignableTarget"]);
    });

    it("refuses moving a buy-N-pay-M discount to a product sold by weight", async () => {
      const store = storeWithBuyNPayMOn("UNIT");

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, target: { kind: "PRODUCT", id: "weighed-1" } },
      );

      expect(outcome).toEqual({ kind: "target_not_sold_by_unit" });
      expect(store.snapshot().discounts[0]?.target).toEqual({ kind: "PRODUCT", id: "product-1" });
    });

    it("refuses moving a buy-N-pay-M discount to a category", async () => {
      const store = storeWithBuyNPayMOn("UNIT");
      store.seedTarget({ kind: "CATEGORY", id: "category-1", active: true });

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, target: { kind: "CATEGORY", id: "category-1" } },
      );

      expect(outcome).toEqual({ kind: "target_not_sold_by_unit" });
    });

    it("moves a buy-N-pay-M discount to another product sold by the unit", async () => {
      const store = storeWithBuyNPayMOn("UNIT");

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, target: { kind: "PRODUCT", id: "unit-2" } },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.snapshot().discounts[0]?.target).toEqual({ kind: "PRODUCT", id: "unit-2" });
    });

    it("changes the quantities without checking the product it already applies to", async () => {
      const store = storeWithBuyNPayMOn("UNIT");

      const outcome = await editDiscount(
        { store, clock },
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
        { store, clock },
        { ...input, target: { kind: "PRODUCT", id: "weighed-1" } },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
    });

    it("answers target_not_found when switching to buy-N-pay-M on a since-deactivated product", async () => {
      const store = seededStore(false);

      const outcome = await editDiscount({ store, clock }, { ...input, benefit: buyThreePayTwo });

      expect(outcome).toEqual({ kind: "target_not_found" });
    });
  });

  it("leaves the discount as it was when the write fails", async () => {
    const store = seededStore();
    store.failingWrites.add("updateDiscount");

    await expect(editDiscount({ store, clock }, { ...input, name: "Otoño" })).rejects.toThrow(
      "updateDiscount failed",
    );

    expect(store.snapshot().discounts).toEqual([stored]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = seededStore();

    await editDiscount({ store, clock }, input);

    expect(store.transactionCount).toBe(1);
  });

  describe("making a buy-N-pay-M discount live again", () => {
    it("refuses switching it on while its product is sold by weight, naming the product", async () => {
      const store = storeWithSwitchedOffBuyNPayM("KG");
      const before = store.snapshot();

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, active: true },
      );

      expect(outcome).toEqual({ kind: "product_sold_by_weight", productName: "Yerba" });
      expect(store.snapshot()).toEqual(before);
      expect(store.operationOrder).toEqual(["lockDiscount", "lockDiscountedProduct"]);
    });

    it("refuses extending an ended one past today while its product is sold by weight", async () => {
      const store = storeWithSwitchedOffBuyNPayM("KG", { active: true, validTo: "2026-12-01" });

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, validTo: "2027-01-31" },
      );

      expect(outcome).toEqual({ kind: "product_sold_by_weight", productName: "Yerba" });
    });

    it("refuses switching it on for its last day, judged by Argentina's calendar day", async () => {
      const store = storeWithSwitchedOffBuyNPayM("KG", { validTo: "2026-12-14" });
      const lateInArgentina = { now: () => new Date("2026-12-15T02:00:00Z") };

      const outcome = await editDiscount(
        { store, clock: lateInArgentina },
        { ...input, benefit: buyThreePayTwo, validTo: "2026-12-14", active: true },
      );

      expect(outcome).toEqual({ kind: "product_sold_by_weight", productName: "Yerba" });
    });

    it("switches it on while its product is sold by the unit, locking the discount, then the product", async () => {
      const store = storeWithSwitchedOffBuyNPayM("UNIT");

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, active: true },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.operationOrder).toEqual([
        "lockDiscount",
        "lockDiscountedProduct",
        "updateDiscount",
      ]);
    });

    it("extends an ended one that stays ended without checking the product", async () => {
      const store = storeWithSwitchedOffBuyNPayM("KG", { active: true, validTo: "2026-12-01" });

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, validFrom: "2026-11-01", validTo: "2026-12-10" },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.operationOrder).toEqual(["lockDiscount", "updateDiscount"]);
    });

    it("keeps it switched off on a product sold by weight without checking the product", async () => {
      const store = storeWithSwitchedOffBuyNPayM("KG");

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, active: false, name: "Otoño" },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.operationOrder).toEqual(["lockDiscount", "updateDiscount"]);
    });

    it("renames one that is already live without checking the product", async () => {
      const store = storeWithBuyNPayMOn("KG");

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, name: "Otoño" },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.operationOrder).toEqual(["lockDiscount", "updateDiscount"]);
    });

    it("switches a percentage discount on without checking the product", async () => {
      const store = storeWithSwitchedOffBuyNPayM("KG", { benefit: stored.benefit });

      const outcome = await editDiscount({ store, clock }, { ...input, active: true });

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.operationOrder).toEqual(["lockDiscount", "updateDiscount"]);
    });

    it("refuses switching it on while its deactivated product is sold by weight, naming the product", async () => {
      const store = new FakeDiscountStore();
      store.seedTarget({
        kind: "PRODUCT",
        id: "product-1",
        name: "Yerba",
        active: false,
        saleUnit: "KG",
      });
      store.seedDiscount({ ...stored, benefit: buyThreePayTwo, active: false });
      const before = store.snapshot();

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, active: true },
      );

      expect(outcome).toEqual({ kind: "product_sold_by_weight", productName: "Yerba" });
      expect(store.snapshot()).toEqual(before);
      expect(store.operationOrder).toEqual(["lockDiscount", "lockDiscountedProduct"]);
    });

    it("switches it on while its deactivated product is sold by the unit", async () => {
      const store = new FakeDiscountStore();
      store.seedTarget({ kind: "PRODUCT", id: "product-1", active: false, saleUnit: "UNIT" });
      store.seedDiscount({ ...stored, benefit: buyThreePayTwo, active: false });

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, active: true },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.operationOrder).toEqual([
        "lockDiscount",
        "lockDiscountedProduct",
        "updateDiscount",
      ]);
    });

    it("switches on one aimed at a category without checking a product", async () => {
      const store = new FakeDiscountStore();
      store.seedTarget({ kind: "CATEGORY", id: "category-1", active: true });
      const category = { kind: "CATEGORY", id: "category-1" } as const;
      store.seedDiscount({ ...stored, benefit: buyThreePayTwo, target: category, active: false });

      const outcome = await editDiscount(
        { store, clock },
        { ...input, benefit: buyThreePayTwo, target: category, active: true },
      );

      expect(outcome).toEqual({ kind: "applied", version: 4 });
      expect(store.operationOrder).toEqual(["lockDiscount", "updateDiscount"]);
    });

    it("keeps answering target_not_sold_by_unit when it also moves to a product sold by weight", async () => {
      const store = storeWithSwitchedOffBuyNPayM("UNIT");
      store.seedTarget({ kind: "PRODUCT", id: "weighed-1", active: true, saleUnit: "KG" });

      const outcome = await editDiscount(
        { store, clock },
        {
          ...input,
          benefit: buyThreePayTwo,
          active: true,
          target: { kind: "PRODUCT", id: "weighed-1" },
        },
      );

      expect(outcome).toEqual({ kind: "target_not_sold_by_unit" });
    });
  });
});

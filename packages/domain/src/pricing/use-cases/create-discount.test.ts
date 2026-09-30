import { describe, expect, it } from "vitest";
import type { CreateDiscountInput } from "./create-discount.js";
import { createDiscount } from "./create-discount.js";
import { FakeDiscountStore } from "./test-support/fake-discount-store.js";

const input: CreateDiscountInput = {
  name: "Verano",
  benefit: { kind: "PERCENT_OFF", percent: 15 },
  target: { kind: "PRODUCT", id: "product-1" },
  validFrom: "2026-12-01",
  validTo: "2027-02-28",
  weekdays: [],
};

const buyThreePayTwo: CreateDiscountInput = {
  ...input,
  benefit: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
};

function storeWithTarget(kind: "PRODUCT" | "CATEGORY" | "TAG" = "PRODUCT", active = true) {
  const store = new FakeDiscountStore();
  store.seedTarget({ kind, id: "product-1", active });
  return store;
}

function storeWithProductSoldBy(saleUnit: "UNIT" | "KG") {
  const store = new FakeDiscountStore();
  store.seedTarget({ kind: "PRODUCT", id: "product-1", active: true, saleUnit });
  return store;
}

describe("createDiscount", () => {
  it("creates an active discount at version 1", async () => {
    const store = storeWithTarget();

    const outcome = await createDiscount({ store }, input);

    expect(outcome).toEqual({ kind: "created", id: "discount-1" });
    expect(store.snapshot().discounts).toEqual([
      { id: "discount-1", ...input, active: true, version: 1 },
    ]);
  });

  it("gives each created discount its own id", async () => {
    const store = storeWithTarget();

    const first = await createDiscount({ store }, input);
    const second = await createDiscount({ store }, input);

    expect([first, second]).toEqual([
      { kind: "created", id: "discount-1" },
      { kind: "created", id: "discount-2" },
    ]);
  });

  it("stores the weekdays sorted", async () => {
    const store = storeWithTarget();

    await createDiscount({ store }, { ...input, weekdays: [7, 1, 5] });

    expect(store.snapshot().discounts[0]?.weekdays).toEqual([1, 5, 7]);
  });

  it.each(["PRODUCT", "CATEGORY", "TAG"] as const)("accepts a %s target", async (kind) => {
    const store = storeWithTarget(kind);

    const outcome = await createDiscount(
      { store },
      { ...input, target: { kind, id: "product-1" } },
    );

    expect(outcome.kind).toBe("created");
  });

  it("refuses a target that does not exist, writing nothing", async () => {
    const store = new FakeDiscountStore();

    const outcome = await createDiscount({ store }, input);

    expect(outcome).toEqual({ kind: "target_not_found" });
    expect(store.snapshot().discounts).toEqual([]);
    expect(store.operationOrder).toEqual(["lockAssignableTarget"]);
  });

  it("refuses a target of another kind that has the same id", async () => {
    const store = storeWithTarget("TAG");

    const outcome = await createDiscount({ store }, input);

    expect(outcome).toEqual({ kind: "target_not_found" });
  });

  it.each(["PRODUCT", "TAG"] as const)("refuses a deactivated %s", async (kind) => {
    const store = storeWithTarget(kind, false);

    const outcome = await createDiscount(
      { store },
      { ...input, target: { kind, id: "product-1" } },
    );

    expect(outcome).toEqual({ kind: "target_not_found" });
    expect(store.snapshot().discounts).toEqual([]);
  });

  it("creates a buy-N-pay-M discount on a product sold by the unit", async () => {
    const store = storeWithProductSoldBy("UNIT");

    const outcome = await createDiscount({ store }, buyThreePayTwo);

    expect(outcome).toEqual({ kind: "created", id: "discount-1" });
    expect(store.snapshot().discounts[0]?.benefit).toEqual({
      kind: "BUY_N_PAY_M",
      buyQty: 3,
      payQty: 2,
    });
  });

  it("refuses a buy-N-pay-M discount on a product sold by weight, writing nothing", async () => {
    const store = storeWithProductSoldBy("KG");

    const outcome = await createDiscount({ store }, buyThreePayTwo);

    expect(outcome).toEqual({ kind: "target_not_sold_by_unit" });
    expect(store.snapshot().discounts).toEqual([]);
    expect(store.operationOrder).toEqual(["lockAssignableTarget"]);
  });

  it.each(["CATEGORY", "TAG"] as const)(
    "refuses a buy-N-pay-M discount on a %s, which is not sold by any unit",
    async (kind) => {
      const store = storeWithTarget(kind);

      const outcome = await createDiscount(
        { store },
        { ...buyThreePayTwo, target: { kind, id: "product-1" } },
      );

      expect(outcome).toEqual({ kind: "target_not_sold_by_unit" });
    },
  );

  it("creates a percentage discount on a product sold by weight", async () => {
    const store = storeWithProductSoldBy("KG");

    const outcome = await createDiscount({ store }, input);

    expect(outcome.kind).toBe("created");
  });

  it("answers target_not_found before the sale unit for a missing product", async () => {
    const store = new FakeDiscountStore();

    const outcome = await createDiscount({ store }, buyThreePayTwo);

    expect(outcome).toEqual({ kind: "target_not_found" });
  });

  it("locks the target before inserting the discount", async () => {
    const store = storeWithTarget();

    await createDiscount({ store }, input);

    expect(store.operationOrder).toEqual(["lockAssignableTarget", "insertDiscount"]);
  });

  it("leaves nothing behind when the insert fails", async () => {
    const store = storeWithTarget();
    store.failingWrites.add("insertDiscount");

    await expect(createDiscount({ store }, input)).rejects.toThrow("insertDiscount failed");

    expect(store.snapshot().discounts).toEqual([]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = storeWithTarget();

    await createDiscount({ store }, input);

    expect(store.transactionCount).toBe(1);
  });
});

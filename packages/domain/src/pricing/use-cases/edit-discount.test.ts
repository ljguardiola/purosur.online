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

function seededStore(productActive = true) {
  const store = new FakeDiscountStore();
  store.seedTarget({ kind: "PRODUCT", id: "product-1", active: productActive });
  store.seedTarget({ kind: "CATEGORY", id: "category-1", active: true });
  store.seedTarget({ kind: "TAG", id: "tag-1", active: false });
  store.seedDiscount(stored);
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

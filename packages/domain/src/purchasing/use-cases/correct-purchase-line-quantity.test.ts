import { describe, expect, it } from "vitest";
import { correctPurchaseLineQuantity } from "./correct-purchase-line-quantity.js";
import {
  ACTOR,
  BRANCH,
  CLOCK,
  NOW,
  PURCHASE_ID,
  storeWithRegisteredPurchase,
} from "./test-support/purchase-correction-scenario.js";

function input(overrides = {}) {
  return {
    purchaseId: PURCHASE_ID,
    lineId: "line-2",
    locationId: BRANCH,
    actorId: ACTOR,
    count: { loadedBy: "quantity" as const, quantity: 3_000 },
    ...overrides,
  };
}

function packagesInput(packages: number, overrides = {}) {
  return input({ lineId: "line-1", count: { loadedBy: "packages", packages }, ...overrides });
}

describe("correctPurchaseLineQuantity", () => {
  it("corrects the quantity of a line loaded by quantity and the units of its lot, leaving the rest of the line", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineQuantity({ store, clock: CLOCK }, input());

    expect(outcome).toEqual({
      kind: "corrected",
      lineId: "line-2",
      quantity: 3_000,
      packages: null,
    });
    const state = store.snapshot();
    expect(state.purchaseLines).toEqual([
      before.purchaseLines[0],
      { ...before.purchaseLines[1], quantity: 3_000 },
    ]);
    expect(state.lotQuantityCorrections).toEqual([
      { locationId: BRANCH, purchaseLineId: "line-2", delta: 500, actorId: ACTOR },
    ]);
    expect(state.receipts).toEqual(before.receipts);
    expect(state.lotCostCorrections).toEqual([]);
    expect(state.lotExpiryCorrections).toEqual([]);
  });

  it("corrects a line loaded by packages by its packages, keeping the quantity of each package", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await correctPurchaseLineQuantity({ store, clock: CLOCK }, packagesInput(3));

    expect(outcome).toEqual({ kind: "corrected", lineId: "line-1", quantity: 36_000, packages: 3 });
    expect(store.snapshot().purchaseLines[0]).toMatchObject({
      packages: 3,
      quantity: 36_000,
      quantityPerPackage: 12_000,
    });
    expect(store.snapshot().lotQuantityCorrections).toEqual([
      { locationId: BRANCH, purchaseLineId: "line-1", delta: 12_000, actorId: ACTOR },
    ]);
  });

  it("takes units from the lot when the quantity goes down", async () => {
    const store = storeWithRegisteredPurchase();

    await correctPurchaseLineQuantity({ store, clock: CLOCK }, packagesInput(1));

    expect(store.snapshot().lotQuantityCorrections[0]?.delta).toBe(-12_000);
  });

  it("records the previous and new quantity and packages with who and when", async () => {
    const store = storeWithRegisteredPurchase();

    await correctPurchaseLineQuantity({ store, clock: CLOCK }, packagesInput(3));
    await correctPurchaseLineQuantity({ store, clock: CLOCK }, input());

    expect(store.snapshot().corrections).toEqual([
      {
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        correctedAt: NOW,
        change: {
          kind: "line_quantity",
          lineId: "line-1",
          previous: { quantity: 24_000, packages: 2 },
          next: { quantity: 36_000, packages: 3 },
        },
      },
      {
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        correctedAt: NOW,
        change: {
          kind: "line_quantity",
          lineId: "line-2",
          previous: { quantity: 2_500, packages: null },
          next: { quantity: 3_000, packages: null },
        },
      },
    ]);
  });

  it("locks the purchase before it corrects the lot", async () => {
    const store = storeWithRegisteredPurchase();

    await correctPurchaseLineQuantity({ store, clock: CLOCK }, input());

    expect(store.lockLog).toEqual([`purchase:${PURCHASE_ID}`, "lot quantity"]);
  });

  it("answers unchanged, writing nothing, when the quantity is the one it has", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const byQuantity = await correctPurchaseLineQuantity(
      { store, clock: CLOCK },
      input({ count: { loadedBy: "quantity", quantity: 2_500 } }),
    );
    const byPackages = await correctPurchaseLineQuantity({ store, clock: CLOCK }, packagesInput(2));

    expect(byQuantity).toEqual({ kind: "unchanged" });
    expect(byPackages).toEqual({ kind: "unchanged" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses a count loaded the other way than the line was, writing nothing", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const quantityOfPackagesLine = await correctPurchaseLineQuantity(
      { store, clock: CLOCK },
      input({ lineId: "line-1" }),
    );
    const packagesOfQuantityLine = await correctPurchaseLineQuantity(
      { store, clock: CLOCK },
      input({ count: { loadedBy: "packages", packages: 3 } }),
    );

    expect(quantityOfPackagesLine).toEqual({ kind: "invalid_quantity" });
    expect(packagesOfQuantityLine).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each([0, -1_000, 1.5, Number.NaN, 2_147_483_648])(
    "refuses the quantity %s before opening a transaction",
    async (quantity) => {
      const store = storeWithRegisteredPurchase();

      const outcome = await correctPurchaseLineQuantity(
        { store, clock: CLOCK },
        input({ count: { loadedBy: "quantity", quantity } }),
      );

      expect(outcome).toEqual({ kind: "invalid_quantity" });
      expect(store.transactionCount).toBe(0);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, 2_147_483_648])(
    "refuses the packages %s before opening a transaction",
    async (packages) => {
      const store = storeWithRegisteredPurchase();

      const outcome = await correctPurchaseLineQuantity(
        { store, clock: CLOCK },
        packagesInput(packages),
      );

      expect(outcome).toEqual({ kind: "invalid_quantity" });
      expect(store.transactionCount).toBe(0);
    },
  );

  it("refuses packages whose quantity is more than a movement can carry, writing nothing", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineQuantity(
      { store, clock: CLOCK },
      packagesInput(200_000),
    );

    expect(outcome).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each(["invalid_quantity", "not_enough_in_lot"] as const)(
    "answers %s from the lot, leaving the line and the audit untouched",
    async (kind) => {
      const store = storeWithRegisteredPurchase();
      store.lotQuantityResult = { kind };
      const before = store.snapshot();

      const outcome = await correctPurchaseLineQuantity({ store, clock: CLOCK }, input());

      expect(outcome).toEqual({ kind });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("answers purchase not found for another branch's purchase, changing nothing", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineQuantity(
      { store, clock: CLOCK },
      input({ locationId: "branch-2" }),
    );

    expect(outcome).toEqual({ kind: "purchase_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers line not found for a line that is not of the purchase", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineQuantity(
      { store, clock: CLOCK },
      input({ lineId: "line-other" }),
    );

    expect(outcome).toEqual({ kind: "line_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each([
    ["correctLotQuantity", 1],
    ["updatePurchaseLineQuantity", 1],
    ["recordPurchaseCorrection", 1],
  ] as const)("rolls back what was written when %s fails at call %s", async (operation, call) => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();
    store.failWriteAtCall(operation, call);

    await expect(correctPurchaseLineQuantity({ store, clock: CLOCK }, input())).rejects.toThrow(
      operation,
    );

    expect(store.snapshot()).toEqual(before);
  });
});

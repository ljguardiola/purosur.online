import { describe, expect, it } from "vitest";
import { correctPurchaseLineCost } from "./correct-purchase-line-cost.js";
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
    lineId: "line-1",
    locationId: BRANCH,
    actorId: ACTOR,
    costPaidCents: 1_200_000,
    ...overrides,
  };
}

describe("correctPurchaseLineCost", () => {
  it("corrects the line's cost and the cost of its lot, leaving the rest of the line", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineCost({ store, clock: CLOCK }, input());

    expect(outcome).toEqual({ kind: "corrected", lineId: "line-1", costPaidCents: 1_200_000 });
    const state = store.snapshot();
    expect(state.purchaseLines).toEqual([
      { ...before.purchaseLines[0], costPaidCents: 1_200_000 },
      before.purchaseLines[1],
    ]);
    expect(state.lotCostCorrections).toEqual([
      { locationId: BRANCH, purchaseLineId: "line-1", costPaidCents: 1_200_000, changedAt: NOW },
    ]);
    expect(state.receipts).toEqual(before.receipts);
    expect(state.lotExpiryCorrections).toEqual([]);
  });

  it("accepts a cost of zero", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await correctPurchaseLineCost(
      { store, clock: CLOCK },
      input({ costPaidCents: 0 }),
    );

    expect(outcome).toEqual({ kind: "corrected", lineId: "line-1", costPaidCents: 0 });
  });

  it("records the previous and new cost with who and when", async () => {
    const store = storeWithRegisteredPurchase();

    await correctPurchaseLineCost({ store, clock: CLOCK }, input());

    expect(store.snapshot().corrections).toEqual([
      {
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        correctedAt: NOW,
        change: {
          kind: "line_cost",
          lineId: "line-1",
          previous: 1_450_050,
          next: 1_200_000,
        },
      },
    ]);
  });

  it("locks the purchase before it corrects the lot", async () => {
    const store = storeWithRegisteredPurchase();

    await correctPurchaseLineCost({ store, clock: CLOCK }, input());

    expect(store.lockLog).toEqual([`purchase:${PURCHASE_ID}`, "lot cost"]);
  });

  it("answers unchanged, writing nothing, when the cost is the one it has", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineCost(
      { store, clock: CLOCK },
      input({ costPaidCents: 1_450_050 }),
    );

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "refuses the cost %s before opening a transaction",
    async (costPaidCents) => {
      const store = storeWithRegisteredPurchase();
      const before = store.snapshot();

      const outcome = await correctPurchaseLineCost(
        { store, clock: CLOCK },
        input({ costPaidCents }),
      );

      expect(outcome).toEqual({ kind: "invalid_cost" });
      expect(store.transactionCount).toBe(0);
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("answers purchase not found for another branch's purchase, changing nothing", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineCost(
      { store, clock: CLOCK },
      input({ locationId: "branch-2" }),
    );

    expect(outcome).toEqual({ kind: "purchase_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers line not found for a line that is not of the purchase", async () => {
    const store = storeWithRegisteredPurchase();
    store.seedPurchase({
      id: "purchase-b",
      supplierId: "supplier-a",
      locationId: BRANCH,
      purchasedOn: "2026-03-01",
      receiptType: "remito",
      receiptNumber: "1",
      note: null,
      recordedAt: NOW,
      actorId: ACTOR,
    });
    store.seedPurchaseLine({
      id: "line-other",
      purchaseId: "purchase-b",
      position: 1,
      productId: "product-a",
      packages: null,
      quantity: 1_000,
      costPaidCents: 1,
      quantityPerPackage: 1_000,
      expiresOn: null,
    });
    const before = store.snapshot();

    const outcome = await correctPurchaseLineCost(
      { store, clock: CLOCK },
      input({ lineId: "line-other" }),
    );

    expect(outcome).toEqual({ kind: "line_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each([
    ["updatePurchaseLineCost", 1],
    ["correctLotCost", 1],
    ["recordPurchaseCorrection", 1],
  ] as const)("rolls back what was written when %s fails at call %s", async (operation, call) => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();
    store.failWriteAtCall(operation, call);

    await expect(correctPurchaseLineCost({ store, clock: CLOCK }, input())).rejects.toThrow(
      operation,
    );

    expect(store.snapshot()).toEqual(before);
  });
});

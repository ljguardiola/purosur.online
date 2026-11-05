import { describe, expect, it } from "vitest";
import { removePurchaseLine } from "./remove-purchase-line.js";
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
    ...overrides,
  };
}

function remove(store: ReturnType<typeof storeWithRegisteredPurchase>, overrides = {}) {
  return removePurchaseLine({ store, clock: CLOCK }, input(overrides));
}

describe("removePurchaseLine", () => {
  it("withdraws the line's lots and marks the line removed at the moment of the correction", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await remove(store);

    expect(outcome).toEqual({ kind: "removed", lineId: "line-1" });
    const state = store.snapshot();
    expect(state.purchaseLines).toEqual([
      { ...before.purchaseLines[0], removedAt: NOW },
      before.purchaseLines[1],
    ]);
    expect(state.lotWithdrawals).toEqual([
      { locationId: BRANCH, purchaseLineId: "line-1", actorId: ACTOR },
    ]);
    expect(state.lotMoves).toEqual([]);
    expect(state.priceReviewPostponements).toEqual([]);
  });

  it("records the removed line's values with who and when", async () => {
    const store = storeWithRegisteredPurchase();

    await remove(store);

    expect(store.snapshot().corrections).toEqual([
      {
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        correctedAt: NOW,
        change: {
          kind: "line_removed",
          lineId: "line-1",
          productId: "product-a",
          quantity: 24_000,
          packages: 2,
          costPaidCents: 1_450_050,
          expiresOn: "2026-11-10",
        },
      },
    ]);
  });

  it("records a line loaded by quantity without packages or expiry date", async () => {
    const store = storeWithRegisteredPurchase();

    await remove(store, { lineId: "line-2" });

    expect(store.snapshot().corrections[0]?.change).toEqual({
      kind: "line_removed",
      lineId: "line-2",
      productId: "product-b",
      quantity: 2_500,
      packages: null,
      costPaidCents: 90_000,
      expiresOn: null,
    });
  });

  it("holds the purchase, then the line's product, then withdraws the lots", async () => {
    const store = storeWithRegisteredPurchase();

    await remove(store);

    expect(store.lockLog).toEqual([
      `purchase:${PURCHASE_ID}`,
      "product:product-a",
      "lot withdrawal",
    ]);
  });

  it("refuses the only line left of the purchase, writing nothing", async () => {
    const store = storeWithRegisteredPurchase();
    await remove(store);
    const before = store.snapshot();

    const outcome = await remove(store, { lineId: "line-2" });

    expect(outcome).toEqual({ kind: "last_line" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses the only line of a purchase of one line", async () => {
    const store = storeWithRegisteredPurchase();
    store.seedPurchase({
      id: "purchase-b",
      supplierId: "supplier-a",
      locationId: BRANCH,
      purchasedOn: "2026-03-05",
      receiptType: "remito",
      receiptNumber: null,
      note: null,
      recordedAt: new Date("2026-03-05T12:00:00Z"),
      actorId: "person-0",
    });
    store.seedPurchaseLine({
      id: "line-9",
      purchaseId: "purchase-b",
      position: 1,
      productId: "product-a",
      packages: null,
      quantity: 1_000,
      costPaidCents: 1_000,
      quantityPerPackage: 1_000,
      expiresOn: null,
    });

    expect(await remove(store, { purchaseId: "purchase-b", lineId: "line-9" })).toEqual({
      kind: "last_line",
    });
  });

  it.each([{ kind: "units_left_lot" }, { kind: "counted_since_receipt" }] as const)(
    "answers %j as the stock does, writing nothing",
    async (result) => {
      const store = storeWithRegisteredPurchase();
      store.lotsWithdrawalResult = result;
      const before = store.snapshot();

      expect(await remove(store)).toEqual(result);
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("answers not found for a purchase of another branch, one that does not exist, or a line that is not its own", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    expect(await remove(store, { locationId: "branch-2" })).toEqual({ kind: "purchase_not_found" });
    expect(await remove(store, { purchaseId: "purchase-gone" })).toEqual({
      kind: "purchase_not_found",
    });
    expect(await remove(store, { lineId: "line-gone" })).toEqual({ kind: "line_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers line not found for a line that was already removed", async () => {
    const store = storeWithRegisteredPurchase();
    await remove(store);
    const before = store.snapshot();

    expect(await remove(store)).toEqual({ kind: "line_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves nothing changed when recording the correction fails", async () => {
    const store = storeWithRegisteredPurchase();
    store.failWriteAtCall("recordPurchaseCorrection", 1);
    const before = store.snapshot();

    await expect(remove(store)).rejects.toThrow("recordPurchaseCorrection failed");
    expect(store.snapshot()).toEqual(before);
  });
});

import { describe, expect, it } from "vitest";
import { correctPurchaseLineExpiry } from "./correct-purchase-line-expiry.js";
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
    expiresOn: "2027-11-10",
    ...overrides,
  };
}

describe("correctPurchaseLineExpiry", () => {
  it("corrects the line's expiry date and the lot's, leaving the rest of the line", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineExpiry({ store, clock: CLOCK }, input());

    expect(outcome).toEqual({ kind: "corrected", lineId: "line-1", expiresOn: "2027-11-10" });
    const state = store.snapshot();
    expect(state.purchaseLines).toEqual([
      { ...before.purchaseLines[0], expiresOn: "2027-11-10" },
      before.purchaseLines[1],
    ]);
    expect(state.lotExpiryCorrections).toEqual([
      { locationId: BRANCH, purchaseLineId: "line-1", expiresOn: "2027-11-10" },
    ]);
  });

  it("clears the expiry date", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await correctPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ expiresOn: null }),
    );

    expect(outcome).toEqual({ kind: "corrected", lineId: "line-1", expiresOn: null });
    expect(store.snapshot().purchaseLines[0]?.expiresOn).toBeNull();
  });

  it("sets an expiry date on a line that had none", async () => {
    const store = storeWithRegisteredPurchase();

    await correctPurchaseLineExpiry({ store, clock: CLOCK }, input({ lineId: "line-2" }));

    expect(store.snapshot().corrections[0]?.change).toEqual({
      kind: "line_expiry",
      lineId: "line-2",
      previous: null,
      next: "2027-11-10",
    });
  });

  it("records the previous and new expiry with who and when", async () => {
    const store = storeWithRegisteredPurchase();

    await correctPurchaseLineExpiry({ store, clock: CLOCK }, input());

    expect(store.snapshot().corrections).toEqual([
      {
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        correctedAt: NOW,
        change: {
          kind: "line_expiry",
          lineId: "line-1",
          previous: "2026-11-10",
          next: "2027-11-10",
        },
      },
    ]);
  });

  it("locks the purchase before it corrects the lot", async () => {
    const store = storeWithRegisteredPurchase();

    await correctPurchaseLineExpiry({ store, clock: CLOCK }, input());

    expect(store.lockLog).toEqual([`purchase:${PURCHASE_ID}`, "lot expiry"]);
  });

  it("answers unchanged, writing nothing, when the date is the one it has", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ expiresOn: "2026-11-10" }),
    );

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers unchanged when a line with no date is given none", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await correctPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ lineId: "line-2", expiresOn: null }),
    );

    expect(outcome).toEqual({ kind: "unchanged" });
  });

  it("answers purchase not found for another branch's purchase, changing nothing", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await correctPurchaseLineExpiry(
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

    const outcome = await correctPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ lineId: "line-other" }),
    );

    expect(outcome).toEqual({ kind: "line_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each([
    ["updatePurchaseLineExpiry", 1],
    ["correctLotExpiry", 1],
    ["recordPurchaseCorrection", 1],
  ] as const)("rolls back what was written when %s fails at call %s", async (operation, call) => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();
    store.failWriteAtCall(operation, call);

    await expect(correctPurchaseLineExpiry({ store, clock: CLOCK }, input())).rejects.toThrow(
      operation,
    );

    expect(store.snapshot()).toEqual(before);
  });
});

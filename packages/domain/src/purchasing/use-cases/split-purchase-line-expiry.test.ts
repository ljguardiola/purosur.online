import { describe, expect, it } from "vitest";
import { splitPurchaseLineExpiry } from "./split-purchase-line-expiry.js";
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
    quantity: 12_000,
    expiresOn: "2027-11-10",
    ...overrides,
  };
}

describe("splitPurchaseLineExpiry", () => {
  it("moves the units into a lot with the corrected date, leaving the line's quantity, cost and date", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await splitPurchaseLineExpiry({ store, clock: CLOCK }, input());

    expect(outcome).toEqual({ kind: "split", lineId: "line-1", lotId: "lot-split-1" });
    const state = store.snapshot();
    expect(state.purchaseLines).toEqual(before.purchaseLines);
    expect(state.lotExpirySplits).toEqual([
      {
        locationId: BRANCH,
        purchaseLineId: "line-1",
        quantity: 12_000,
        expiresOn: "2027-11-10",
        occurredAt: NOW,
        actorId: ACTOR,
      },
    ]);
    expect(state.lotExpiryCorrections).toEqual([]);
  });

  it("splits units out of a line with no date, giving them one", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await splitPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ lineId: "line-2" }),
    );

    expect(outcome).toMatchObject({ kind: "split", lineId: "line-2" });
  });

  it("splits units out of a line so that they have no date", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await splitPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ expiresOn: null }),
    );

    expect(outcome).toMatchObject({ kind: "split" });
    expect(store.snapshot().lotExpirySplits[0]?.expiresOn).toBeNull();
  });

  it("records the units with the previous and new expiry date, who did it and when", async () => {
    const store = storeWithRegisteredPurchase();

    await splitPurchaseLineExpiry({ store, clock: CLOCK }, input());

    expect(store.snapshot().corrections).toEqual([
      {
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        correctedAt: NOW,
        change: {
          kind: "line_expiry_split",
          lineId: "line-1",
          quantity: 12_000,
          previous: "2026-11-10",
          next: "2027-11-10",
        },
      },
    ]);
  });

  it("locks the purchase before it splits the lot", async () => {
    const store = storeWithRegisteredPurchase();

    await splitPurchaseLineExpiry({ store, clock: CLOCK }, input());

    expect(store.lockLog).toEqual([`purchase:${PURCHASE_ID}`, "lot split"]);
  });

  it("answers not enough in the lot, recording nothing, when the lot cannot give up those units", async () => {
    const store = storeWithRegisteredPurchase();
    store.lotSplitResult = { kind: "not_enough_in_lot" };
    const before = store.snapshot();

    const outcome = await splitPurchaseLineExpiry({ store, clock: CLOCK }, input());

    expect(outcome).toEqual({ kind: "not_enough_in_lot" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers unchanged, writing nothing, when the date is the line's own", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await splitPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ expiresOn: "2026-11-10" }),
    );

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(store.snapshot()).toEqual(before);
    expect(store.lockLog).toEqual([`purchase:${PURCHASE_ID}`]);
  });

  it("answers unchanged when units of a line with no date are given none", async () => {
    const store = storeWithRegisteredPurchase();

    const outcome = await splitPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ lineId: "line-2", expiresOn: null }),
    );

    expect(outcome).toEqual({ kind: "unchanged" });
  });

  it("answers purchase not found for another branch's purchase, changing nothing", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await splitPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ locationId: "branch-2" }),
    );

    expect(outcome).toEqual({ kind: "purchase_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers line not found for a line that is not of the purchase", async () => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();

    const outcome = await splitPurchaseLineExpiry(
      { store, clock: CLOCK },
      input({ lineId: "line-other" }),
    );

    expect(outcome).toEqual({ kind: "line_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each([
    ["splitLotExpiry", 1],
    ["recordPurchaseCorrection", 1],
  ] as const)("rolls back what was written when %s fails at call %s", async (operation, call) => {
    const store = storeWithRegisteredPurchase();
    const before = store.snapshot();
    store.failWriteAtCall(operation, call);

    await expect(splitPurchaseLineExpiry({ store, clock: CLOCK }, input())).rejects.toThrow(
      operation,
    );

    expect(store.snapshot()).toEqual(before);
  });
});

import { describe, expect, it } from "vitest";
import { correctPurchasedLotCost } from "./correct-purchased-lot-cost.js";
import {
  type FakePurchasedLot,
  FakePurchasedLotTransaction,
} from "./test-support/fake-purchased-lot-store.js";

const CHANGED_AT = new Date("2026-03-10T15:00:00Z");

function lot(overrides: Partial<FakePurchasedLot> = {}): FakePurchasedLot {
  return {
    lotId: "lot-1",
    purchaseLineId: "line-1",
    productId: "product-a",
    locationId: "branch-1",
    expiresOn: "2026-11-10",
    purchasedOn: "2026-03-05",
    nameOrder: 1,
    givenNumber: null,
    remaining: 6,
    ...overrides,
  };
}

function transaction(lots = [lot()]) {
  return new FakePurchasedLotTransaction(
    lots,
    new Map([
      ["lot-1", { totalCents: 5_000, quantity: 1_000 }],
      ["lot-2", { totalCents: 300, quantity: 1_000 }],
    ]),
  );
}

function input(overrides = {}) {
  return {
    locationId: "branch-1",
    purchaseLineId: "line-1",
    totalCents: 9_000,
    changedAt: CHANGED_AT,
    ...overrides,
  };
}

describe("correctPurchasedLotCost", () => {
  it("gives the lot of the purchase line the corrected total, keeping its cost quantity and its other lots", async () => {
    const tx = transaction([lot(), lot({ lotId: "lot-2", purchaseLineId: "line-2" })]);

    const outcome = await correctPurchasedLotCost(tx, input());

    expect(outcome).toEqual({ kind: "corrected" });
    expect(tx.costs.get("lot-1")).toEqual({ totalCents: 9_000, quantity: 1_000 });
    expect(tx.costs.get("lot-2")).toEqual({ totalCents: 300, quantity: 1_000 });
  });

  it("records the cost the lot had and when it changed", async () => {
    const tx = transaction();

    await correctPurchasedLotCost(tx, input());

    expect(tx.costChanges).toEqual([
      { lotId: "lot-1", changedAt: CHANGED_AT, previous: { totalCents: 5_000, quantity: 1_000 } },
    ]);
  });

  it("leaves the remaining quantity and the expiry date of the lot", async () => {
    const tx = transaction();

    await correctPurchasedLotCost(tx, input());

    expect(tx.lots).toEqual([lot()]);
  });

  it("locks the product's stock before it reads and changes the cost", async () => {
    const tx = transaction();

    await correctPurchasedLotCost(tx, input());

    expect(tx.operations).toEqual([
      "lotsOfPurchaseLines",
      "lockProductStock:product-a",
      "costOfLot",
      "recordLotCostChange",
      "setLotCost",
    ]);
  });

  it("corrects every lot of the line, each with its own record of the cost it had", async () => {
    const tx = new FakePurchasedLotTransaction(
      [
        lot(),
        lot({ lotId: "lot-2", splitFromLotId: "lot-1", remaining: 2 }),
        lot({ lotId: "lot-3", purchaseLineId: "line-2" }),
      ],
      new Map([
        ["lot-1", { totalCents: 5_000, quantity: 1_000 }],
        ["lot-2", { totalCents: 5_000, quantity: 2_000 }],
        ["lot-3", { totalCents: 300, quantity: 1_000 }],
      ]),
    );

    const outcome = await correctPurchasedLotCost(tx, input());

    expect(outcome).toEqual({ kind: "corrected" });
    expect(tx.costs.get("lot-1")).toEqual({ totalCents: 9_000, quantity: 1_000 });
    expect(tx.costs.get("lot-2")).toEqual({ totalCents: 9_000, quantity: 2_000 });
    expect(tx.costs.get("lot-3")).toEqual({ totalCents: 300, quantity: 1_000 });
    expect(tx.costChanges).toEqual([
      { lotId: "lot-1", changedAt: CHANGED_AT, previous: { totalCents: 5_000, quantity: 1_000 } },
      { lotId: "lot-2", changedAt: CHANGED_AT, previous: { totalCents: 5_000, quantity: 2_000 } },
    ]);
  });

  it("changes nothing when one of the line's lots has no cost to correct", async () => {
    const tx = new FakePurchasedLotTransaction(
      [lot(), lot({ lotId: "lot-2", splitFromLotId: "lot-1" })],
      new Map([["lot-1", { totalCents: 5_000, quantity: 1_000 }]]),
    );

    const outcome = await correctPurchasedLotCost(tx, input());

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.costChanges).toEqual([]);
    expect(tx.costs.get("lot-1")).toEqual({ totalCents: 5_000, quantity: 1_000 });
  });

  it("answers not found, changing nothing, when no lot of the branch came from the purchase line", async () => {
    const tx = transaction([lot({ locationId: "branch-2" })]);

    const outcome = await correctPurchasedLotCost(tx, input());

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.operations).toEqual(["lotsOfPurchaseLines"]);
  });

  it("answers not found, changing nothing, when the product's stock is gone", async () => {
    const tx = transaction();
    tx.missingProducts.add("product-a");

    const outcome = await correctPurchasedLotCost(tx, input());

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.costChanges).toEqual([]);
    expect(tx.costs.get("lot-1")).toEqual({ totalCents: 5_000, quantity: 1_000 });
  });

  it("answers not found, changing nothing, when the lot has no cost to correct", async () => {
    const tx = new FakePurchasedLotTransaction([lot()]);

    const outcome = await correctPurchasedLotCost(tx, input());

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.costChanges).toEqual([]);
    expect(tx.costs.size).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { splitPurchasedLot } from "./split-purchased-lot.js";
import {
  type FakePurchasedLot,
  FakePurchasedLotTransaction,
} from "./test-support/fake-purchased-lot-store.js";

const OCCURRED_AT = new Date("2026-03-10T15:00:00Z");
const LINE_LOT_CREATED_AT = new Date("2026-03-05T12:00:00Z");

function lot(overrides: Partial<FakePurchasedLot> = {}): FakePurchasedLot {
  return {
    lotId: "lot-1",
    purchaseLineId: "line-1",
    productId: "product-a",
    locationId: "branch-1",
    expiresOn: "2026-11-10",
    purchasedOn: "2026-03-05",
    createdAt: LINE_LOT_CREATED_AT,
    nameOrder: 1,
    givenNumber: null,
    remaining: 4_000,
    ...overrides,
  };
}

function transaction(lots = [lot()]) {
  return new FakePurchasedLotTransaction(
    lots,
    new Map([["lot-1", { totalCents: 5_000, quantity: 2_000 }]]),
  );
}

function input(overrides = {}) {
  return {
    locationId: "branch-1",
    purchaseLineId: "line-1",
    quantity: 1_000,
    expiresOn: "2027-01-15",
    occurredAt: OCCURRED_AT,
    actorId: "person-1",
    ...overrides,
  };
}

describe("splitPurchasedLot", () => {
  it("moves the units into a lot of their own with the corrected expiry date and the line's cost and purchase day", async () => {
    const tx = transaction();

    const outcome = await splitPurchasedLot(tx, input());

    expect(outcome).toEqual({ kind: "split", lotId: "lot-split-2" });
    expect(tx.lots).toEqual([
      lot({ remaining: 3_000 }),
      lot({
        lotId: "lot-split-2",
        splitFromLotId: "lot-1",
        expiresOn: "2027-01-15",
        quantityReceived: 1_000,
        costIncomplete: false,
        nameOrder: 2,
        remaining: 1_000,
      }),
    ]);
    expect(tx.costs.get("lot-split-2")).toEqual({ totalCents: 5_000, quantity: 2_000 });
    expect(tx.costs.get("lot-1")).toEqual({ totalCents: 5_000, quantity: 2_000 });
  });

  it("gives the new lot the receipt time of the line's lot, so its shelf life is not shortened", async () => {
    const tx = transaction();

    await splitPurchasedLot(tx, input({ occurredAt: new Date("2026-04-01T00:00:00Z") }));

    expect(tx.lots[1]?.createdAt).toEqual(LINE_LOT_CREATED_AT);
  });

  it("keeps the lot's incomplete cost flag and carries no cost when it has none", async () => {
    const tx = new FakePurchasedLotTransaction([lot({ costIncomplete: true })]);

    await splitPurchasedLot(tx, input());

    expect(tx.lots[1]?.costIncomplete).toBe(true);
    expect(tx.costs.has("lot-split-2")).toBe(false);
  });

  it("records one movement of the split with no quantity, reason, purchase line or sale", async () => {
    const tx = transaction();

    await splitPurchasedLot(tx, input());

    expect(tx.movements).toEqual([
      {
        productId: "product-a",
        locationId: "branch-1",
        kind: "lot_split",
        reason: null,
        delta: 0,
        occurredAt: OCCURRED_AT,
        actorId: "person-1",
        supersededByCountId: null,
      },
    ]);
  });

  it("takes the units from the line's lot and gives them to the new one in that movement", async () => {
    const tx = transaction();

    await splitPurchasedLot(tx, input());

    expect(tx.allocations).toEqual([
      { movementId: "movement-1", lotId: "lot-1", quantity: -1_000 },
      { movementId: "movement-1", lotId: "lot-split-2", quantity: 1_000 },
    ]);
  });

  it("locks the product's stock before it reads the lot or changes anything", async () => {
    const tx = transaction();

    await splitPurchasedLot(tx, input());

    expect(tx.operations).toEqual([
      "lotsOfPurchaseLines",
      "lockProductStock:product-a",
      "splittableLot",
      "costOfLot",
      "recordMovement:lot_split",
      "recordSplitLot",
      "allocateToLot",
      "allocateToLot",
    ]);
  });

  it("splits the line's own lot, not a lot already split from it", async () => {
    const tx = transaction([
      lot({ lotId: "lot-0", splitFromLotId: "lot-1", remaining: 9_000, nameOrder: 2 }),
      lot(),
    ]);

    await splitPurchasedLot(tx, input());

    expect(tx.allocations[0]).toMatchObject({ lotId: "lot-1", quantity: -1_000 });
    expect(tx.lots.at(-1)?.splitFromLotId).toBe("lot-1");
  });

  it.each([4_000, 5_000])(
    "refuses to split %i units out of a lot with 4000 left, changing nothing",
    async (quantity) => {
      const tx = transaction();

      const outcome = await splitPurchasedLot(tx, input({ quantity }));

      expect(outcome).toEqual({ kind: "not_enough_in_lot" });
      expect(tx.movements).toEqual([]);
      expect(tx.allocations).toEqual([]);
      expect(tx.lots).toEqual([lot()]);
    },
  );

  it.each([0, -1_000, 500.5, 1_500])(
    "refuses %s as a quantity of a product sold by the unit, before it reads the lot",
    async (quantity) => {
      const tx = transaction();

      const outcome = await splitPurchasedLot(tx, input({ quantity }));

      expect(outcome).toEqual({ kind: "invalid_quantity" });
      expect(tx.operations).toEqual(["lotsOfPurchaseLines", "lockProductStock:product-a"]);
      expect(tx.lots).toEqual([lot()]);
    },
  );

  it("splits part of a unit off a product sold by weight", async () => {
    const tx = transaction();
    tx.saleUnit = "KG";

    const outcome = await splitPurchasedLot(tx, input({ quantity: 1_500 }));

    expect(outcome).toEqual({ kind: "split", lotId: "lot-split-2" });
    expect(tx.lots.map(({ remaining }) => remaining)).toEqual([2_500, 1_500]);
  });

  it("refuses to split a lot that is in debt", async () => {
    const tx = transaction([lot({ remaining: -2_000 })]);

    const outcome = await splitPurchasedLot(tx, input());

    expect(outcome).toEqual({ kind: "not_enough_in_lot" });
  });

  it("answers not found, changing nothing, when no lot of the branch came from the purchase line", async () => {
    const tx = transaction([lot({ locationId: "branch-2" })]);

    const outcome = await splitPurchasedLot(tx, input());

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.operations).toEqual(["lotsOfPurchaseLines"]);
  });

  it("answers not found when only split lots came from the purchase line", async () => {
    const tx = transaction([lot({ splitFromLotId: "lot-9" })]);

    const outcome = await splitPurchasedLot(tx, input());

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("answers not found, changing nothing, when the product's stock is gone", async () => {
    const tx = transaction();
    tx.missingProducts.add("product-a");

    const outcome = await splitPurchasedLot(tx, input());

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.movements).toEqual([]);
    expect(tx.lots).toEqual([lot()]);
  });
});

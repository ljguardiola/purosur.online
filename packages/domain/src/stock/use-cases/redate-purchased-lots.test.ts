import { describe, expect, it } from "vitest";
import { redatePurchasedLots } from "./redate-purchased-lots.js";
import {
  type FakePurchasedLot,
  FakePurchasedLotTransaction,
} from "./test-support/fake-purchased-lot-store.js";

function lot(overrides: Partial<FakePurchasedLot> = {}): FakePurchasedLot {
  return {
    lotId: "lot-1",
    purchaseLineId: "line-1",
    productId: "product-a",
    locationId: "branch-1",
    expiresOn: "2026-11-10",
    purchasedOn: "2026-10-01",
    remaining: 4,
    ...overrides,
  };
}

describe("redatePurchasedLots", () => {
  it("dates the lots of the purchase lines by the new date, leaving other lots and quantities", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot(),
      lot({ lotId: "lot-2", purchaseLineId: "line-2", productId: "product-b" }),
      lot({ lotId: "lot-3", purchaseLineId: "line-3" }),
    ]);

    const outcome = await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-1", "line-2"],
      purchasedOn: "2026-09-30",
    });

    expect(outcome).toEqual({ kind: "redated" });
    expect(
      tx.lots.map(({ lotId, purchasedOn, remaining }) => [lotId, purchasedOn, remaining]),
    ).toEqual([
      ["lot-1", "2026-09-30", 4],
      ["lot-2", "2026-09-30", 4],
      ["lot-3", "2026-10-01", 4],
    ]);
  });

  it("redates the only lot of a purchase with a single line", async () => {
    const tx = new FakePurchasedLotTransaction([lot()]);

    const outcome = await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-1"],
      purchasedOn: "2026-09-30",
    });

    expect(outcome).toEqual({ kind: "redated" });
    expect(tx.lots[0]?.purchasedOn).toBe("2026-09-30");
  });

  it("locks each product's stock once, in order, before it changes any lot", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot({ productId: "product-b" }),
      lot({ lotId: "lot-2", purchaseLineId: "line-2", productId: "product-a" }),
      lot({ lotId: "lot-3", purchaseLineId: "line-3", productId: "product-b" }),
    ]);

    await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-1", "line-2", "line-3"],
      purchasedOn: "2026-09-30",
    });

    expect(tx.operations).toEqual([
      "lotsOfPurchaseLines",
      "lockProductStock:product-a",
      "lockProductStock:product-b",
      "setLotsPurchasedOn",
    ]);
  });

  it("answers not found, changing nothing, when a purchase line has no lot in the branch", async () => {
    const tx = new FakePurchasedLotTransaction([lot()]);

    const outcome = await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-1", "line-2"],
      purchasedOn: "2026-09-30",
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.operations).toEqual(["lotsOfPurchaseLines"]);
  });

  it("answers not found, changing nothing, when a product's stock is gone", async () => {
    const tx = new FakePurchasedLotTransaction([lot()]);
    tx.missingProducts.add("product-a");

    const outcome = await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-1"],
      purchasedOn: "2026-09-30",
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.lots[0]?.purchasedOn).toBe("2026-10-01");
  });
});

import { describe, expect, it } from "vitest";
import { correctLotExpiry } from "./correct-lot-expiry.js";
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
    nameOrder: 1,
    givenNumber: null,
    remaining: 4,
    ...overrides,
  };
}

describe("correctLotExpiry", () => {
  it("gives the lot of the purchase line the new expiry date and leaves its remaining quantity", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot(),
      lot({ lotId: "lot-2", purchaseLineId: "line-2" }),
    ]);

    const outcome = await correctLotExpiry(tx, {
      locationId: "branch-1",
      purchaseLineId: "line-1",
      expiresOn: "2027-11-10",
    });

    expect(outcome).toEqual({ kind: "corrected" });
    expect(tx.lots).toEqual([
      lot({ expiresOn: "2027-11-10", remaining: 4 }),
      lot({ lotId: "lot-2", purchaseLineId: "line-2" }),
    ]);
  });

  it("leaves the lots split from the line's lot, which keep their own expiry date", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot({ lotId: "lot-split", splitFromLotId: "lot-1", expiresOn: "2026-12-24", nameOrder: 2 }),
      lot(),
    ]);

    const outcome = await correctLotExpiry(tx, {
      locationId: "branch-1",
      purchaseLineId: "line-1",
      expiresOn: "2027-11-10",
    });

    expect(outcome).toEqual({ kind: "corrected" });
    expect(tx.lots.map(({ lotId, expiresOn }) => [lotId, expiresOn])).toEqual([
      ["lot-split", "2026-12-24"],
      ["lot-1", "2027-11-10"],
    ]);
  });

  it("clears the expiry date of the lot", async () => {
    const tx = new FakePurchasedLotTransaction([lot()]);

    await correctLotExpiry(tx, {
      locationId: "branch-1",
      purchaseLineId: "line-1",
      expiresOn: null,
    });

    expect(tx.lots[0]?.expiresOn).toBeNull();
  });

  it("locks the product's stock before it changes the lot", async () => {
    const tx = new FakePurchasedLotTransaction([lot()]);

    await correctLotExpiry(tx, {
      locationId: "branch-1",
      purchaseLineId: "line-1",
      expiresOn: "2027-11-10",
    });

    expect(tx.operations).toEqual([
      "lotsOfPurchaseLines",
      "lockProductStock:product-a",
      "setLotExpiry",
    ]);
  });

  it("answers not found, changing nothing, when no lot of the branch came from the purchase line", async () => {
    const tx = new FakePurchasedLotTransaction([lot({ locationId: "branch-2" })]);

    const outcome = await correctLotExpiry(tx, {
      locationId: "branch-1",
      purchaseLineId: "line-1",
      expiresOn: "2027-11-10",
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.operations).toEqual(["lotsOfPurchaseLines"]);
  });

  it("answers not found, changing nothing, when the product's stock is gone", async () => {
    const tx = new FakePurchasedLotTransaction([lot()]);
    tx.missingProducts.add("product-a");

    const outcome = await correctLotExpiry(tx, {
      locationId: "branch-1",
      purchaseLineId: "line-1",
      expiresOn: "2027-11-10",
    });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(tx.lots[0]?.expiresOn).toBe("2026-11-10");
  });
});

import { describe, expect, it } from "vitest";
import { FIXED_ARGENTINA_ZONE_RULES } from "../../shared/zone-rules.js";
import { lotNames } from "../model/lot-name.js";
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
    nameOrder: 1,
    givenNumber: null,
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

  it("makes the redated lots take their name again, after every lot that already has one", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot({ nameOrder: 1 }),
      lot({ lotId: "lot-2", purchaseLineId: "line-2", nameOrder: 2 }),
      lot({ lotId: "lot-3", purchaseLineId: "line-3", nameOrder: 3 }),
    ]);

    await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-1", "line-2"],
      purchasedOn: "2026-09-30",
    });

    expect(tx.lots.map(({ lotId, nameOrder }) => [lotId, nameOrder])).toEqual([
      ["lot-1", 4],
      ["lot-2", 5],
      ["lot-3", 3],
    ]);
  });

  it("redates the lots split from a line's lot along with it", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot(),
      lot({ lotId: "lot-2", splitFromLotId: "lot-1", nameOrder: 2 }),
    ]);

    const outcome = await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-1"],
      purchasedOn: "2026-09-30",
    });

    expect(outcome).toEqual({ kind: "redated" });
    expect(tx.lots.map(({ lotId, purchasedOn }) => [lotId, purchasedOn])).toEqual([
      ["lot-1", "2026-09-30"],
      ["lot-2", "2026-09-30"],
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
      "namingOfPurchasedLots",
      "giveLotNumbers",
      "renameLotsToPurchaseDay",
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

  it("leaves every other purchase's lot of the day it leaves with the number it read", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot({ nameOrder: 1, purchasedOn: "2026-11-03" }),
      lot({ lotId: "lot-2", purchaseLineId: "line-2", nameOrder: 2, purchasedOn: "2026-11-03" }),
      lot({ lotId: "lot-3", purchaseLineId: "line-3", nameOrder: 3, purchasedOn: "2026-11-03" }),
    ]);

    await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-2"],
      purchasedOn: "2026-11-02",
    });

    const names = lotNames(tx.nameFacts(), FIXED_ARGENTINA_ZONE_RULES);
    expect(names.get("lot-1")).toEqual({ origin: "purchase", day: "2026-11-03", number: 1 });
    expect(names.get("lot-3")).toEqual({ origin: "purchase", day: "2026-11-03", number: 3 });
    expect(names.get("lot-2")).toEqual({ origin: "purchase", day: "2026-11-02", number: null });
  });

  it("leaves the only other lot of the day it leaves with the number it read", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot({ nameOrder: 1, purchasedOn: "2026-11-03" }),
      lot({ lotId: "lot-2", purchaseLineId: "line-2", nameOrder: 2, purchasedOn: "2026-11-03" }),
    ]);

    await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-1"],
      purchasedOn: "2026-11-02",
    });

    const names = lotNames(tx.nameFacts(), FIXED_ARGENTINA_ZONE_RULES);
    expect(names.get("lot-2")?.number).toBe(2);
  });

  it("numbers the only lot of the day it joins first and itself second", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot({ nameOrder: 1, purchasedOn: "2026-11-02" }),
      lot({ lotId: "lot-2", purchaseLineId: "line-2", nameOrder: 2, purchasedOn: "2026-11-03" }),
    ]);
    expect(lotNames(tx.nameFacts(), FIXED_ARGENTINA_ZONE_RULES).get("lot-1")?.number).toBeNull();

    await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-2"],
      purchasedOn: "2026-11-02",
    });

    const names = lotNames(tx.nameFacts(), FIXED_ARGENTINA_ZONE_RULES);
    expect(names.get("lot-1")?.number).toBe(1);
    expect(names.get("lot-2")?.number).toBe(2);
  });

  it("reads the names of only the redated lots' products in the branch", async () => {
    const tx = new FakePurchasedLotTransaction([
      lot({ nameOrder: 1 }),
      lot({ lotId: "lot-2", purchaseLineId: "line-2", nameOrder: 2 }),
      lot({ lotId: "lot-3", purchaseLineId: "line-3", productId: "product-b", nameOrder: 3 }),
      lot({ lotId: "lot-4", purchaseLineId: "line-4", productId: "product-b", nameOrder: 4 }),
      lot({ lotId: "lot-5", purchaseLineId: "line-5", locationId: "branch-2", nameOrder: 5 }),
    ]);

    await redatePurchasedLots(tx, {
      locationId: "branch-1",
      purchaseLineIds: ["line-1"],
      purchasedOn: "2026-09-30",
    });

    expect(tx.lots.map(({ lotId, givenNumber }) => [lotId, givenNumber])).toEqual([
      ["lot-1", null],
      ["lot-2", 2],
      ["lot-3", null],
      ["lot-4", null],
      ["lot-5", null],
    ]);
  });
});

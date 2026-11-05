import { describe, expect, it } from "vitest";
import { changePurchaseLineProduct } from "./change-purchase-line-product.js";
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
    productId: "product-c",
    ...overrides,
  };
}

function storeWithThirdProduct() {
  const store = storeWithRegisteredPurchase();
  store.seedProduct({ id: "product-c", name: "Fideos", saleUnit: "UNIT", active: true });
  return store;
}

function change(store: ReturnType<typeof storeWithThirdProduct>, overrides = {}) {
  return changePurchaseLineProduct({ store, clock: CLOCK }, input(overrides));
}

describe("changePurchaseLineProduct", () => {
  it("moves the line's lots to the new product and sets the product of the line, leaving the rest of it", async () => {
    const store = storeWithThirdProduct();
    const before = store.snapshot();

    const outcome = await change(store);

    expect(outcome).toEqual({ kind: "changed", lineId: "line-1", productId: "product-c" });
    const state = store.snapshot();
    expect(state.purchaseLines).toEqual([
      { ...before.purchaseLines[0], productId: "product-c" },
      before.purchaseLines[1],
    ]);
    expect(state.lotMoves).toEqual([
      { locationId: BRANCH, purchaseLineId: "line-1", productId: "product-c", actorId: ACTOR },
    ]);
    expect(state.receipts).toEqual(before.receipts);
    expect(state.lotCostCorrections).toEqual([]);
    expect(state.lotWithdrawals).toEqual([]);
  });

  it("postpones the price review of the new product, at the moment of the correction", async () => {
    const store = storeWithThirdProduct();

    await change(store);

    expect(store.snapshot().priceReviewPostponements).toEqual([
      {
        locationId: BRANCH,
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        postponedAt: NOW,
        productIds: ["product-c"],
      },
    ]);
  });

  it("records the previous and new product with who and when", async () => {
    const store = storeWithThirdProduct();

    await change(store);

    expect(store.snapshot().corrections).toEqual([
      {
        purchaseId: PURCHASE_ID,
        actorId: ACTOR,
        correctedAt: NOW,
        change: {
          kind: "line_product",
          lineId: "line-1",
          previous: "product-a",
          next: "product-c",
        },
      },
    ]);
  });

  it("holds the purchase, then both products in the order of their ids, the new one first when its id comes first", async () => {
    const store = storeWithThirdProduct();
    store.seedProduct({ id: "product-0", name: "Azucar", saleUnit: "KG", active: true });

    await change(store, { lineId: "line-2", productId: "product-0" });

    expect(store.lockLog).toEqual([
      `purchase:${PURCHASE_ID}`,
      "product:product-0",
      "product:product-b",
      "lot move",
    ]);
  });

  it("holds the old product before the new one when its id comes first", async () => {
    const store = storeWithThirdProduct();

    await change(store);

    expect(store.lockLog).toEqual([
      `purchase:${PURCHASE_ID}`,
      "product:product-a",
      "product:product-c",
      "lot move",
    ]);
  });

  it("answers unchanged, writing nothing, when the line already has the product", async () => {
    const store = storeWithThirdProduct();
    const before = store.snapshot();

    const outcome = await change(store, { productId: "product-a" });

    expect(outcome).toEqual({ kind: "unchanged" });
    expect(store.snapshot()).toEqual(before);
  });

  it("validates the new product as a registered line does, loading a line by quantity or by packages", async () => {
    const store = storeWithThirdProduct();
    store.seedPurchaseLine({
      id: "line-3",
      purchaseId: PURCHASE_ID,
      position: 3,
      productId: "product-b",
      packages: 1,
      quantity: 1_500,
      costPaidCents: 50_000,
      quantityPerPackage: 1_500,
      expiresOn: null,
    });
    const before = store.snapshot();

    expect(await change(store, { lineId: "line-2", productId: "product-a" })).toEqual({
      kind: "invalid_quantity",
    });
    expect(await change(store, { lineId: "line-3", productId: "product-a" })).toEqual({
      kind: "invalid_quantity",
    });
    expect(store.snapshot()).toEqual(before);
  });

  it("accepts a packaged line on a product sold in a quantity that fits each package", async () => {
    const store = storeWithThirdProduct();
    store.seedProduct({ id: "product-d", name: "Arroz", saleUnit: "KG", active: true });

    expect(await change(store, { productId: "product-d" })).toEqual({
      kind: "changed",
      lineId: "line-1",
      productId: "product-d",
    });
  });

  it("refuses a product that does not exist or is inactive, writing nothing", async () => {
    const store = storeWithThirdProduct();
    store.seedProduct({ id: "product-e", name: "Viejo", saleUnit: "UNIT", active: false });
    const before = store.snapshot();

    expect(await change(store, { productId: "product-gone" })).toEqual({
      kind: "product_not_found",
    });
    expect(await change(store, { productId: "product-e" })).toEqual({ kind: "product_inactive" });
    expect(store.snapshot()).toEqual(before);
  });

  it("moves a line off a product that is no longer active", async () => {
    const store = storeWithThirdProduct();
    store.seedProduct({ id: "product-e", name: "Viejo", saleUnit: "UNIT", active: false });
    store.seedPurchaseLine({
      id: "line-3",
      purchaseId: PURCHASE_ID,
      position: 3,
      productId: "product-e",
      packages: null,
      quantity: 2_000,
      costPaidCents: 50_000,
      quantityPerPackage: 1_000,
      expiresOn: null,
    });

    const outcome = await change(store, { lineId: "line-3" });

    expect(outcome).toEqual({ kind: "changed", lineId: "line-3", productId: "product-c" });
  });

  it.each([{ kind: "units_left_lot" }, { kind: "counted_since_receipt" }] as const)(
    "answers %j as the stock does, writing nothing",
    async (result) => {
      const store = storeWithThirdProduct();
      store.lotsMoveResult = result;
      const before = store.snapshot();

      expect(await change(store)).toEqual(result);
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("answers not found for a purchase of another branch, one that does not exist, or a line that is not its own", async () => {
    const store = storeWithThirdProduct();
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
    const before = store.snapshot();

    expect(await change(store, { locationId: "branch-2" })).toEqual({ kind: "purchase_not_found" });
    expect(await change(store, { purchaseId: "purchase-gone" })).toEqual({
      kind: "purchase_not_found",
    });
    expect(await change(store, { purchaseId: "purchase-b" })).toEqual({ kind: "line_not_found" });
    expect(await change(store, { lineId: "line-gone" })).toEqual({ kind: "line_not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers line not found for a line that was removed", async () => {
    const store = storeWithThirdProduct();
    store.seedPurchaseLine({
      id: "line-removed",
      purchaseId: PURCHASE_ID,
      position: 3,
      productId: "product-a",
      packages: null,
      quantity: 1_000,
      costPaidCents: 1_000,
      quantityPerPackage: 1_000,
      expiresOn: null,
      removedAt: NOW,
    });

    expect(await change(store, { lineId: "line-removed" })).toEqual({ kind: "line_not_found" });
  });

  it("leaves nothing changed when recording the correction fails", async () => {
    const store = storeWithThirdProduct();
    store.failWriteAtCall("recordPurchaseCorrection", 1);
    const before = store.snapshot();

    await expect(change(store)).rejects.toThrow("recordPurchaseCorrection failed");
    expect(store.snapshot()).toEqual(before);
  });
});

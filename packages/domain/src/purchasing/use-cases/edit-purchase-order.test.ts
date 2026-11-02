import { describe, expect, it } from "vitest";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import { type EditPurchaseOrderInput, editPurchaseOrder } from "./edit-purchase-order.js";
import {
  type FakePurchaseOrderRow,
  FakePurchaseOrderStore,
} from "./test-support/fake-purchase-order-store.js";

const BRANCH = "branch-1";
const NOW = new Date("2026-03-10T15:00:00Z");

function draft(overrides: Partial<FakePurchaseOrderRow> = {}): FakePurchaseOrderRow {
  return {
    id: "order-9",
    supplierId: "supplier-a",
    locationId: BRANCH,
    state: "DRAFT",
    createdAt: NOW,
    actorId: "person-1",
    cancelledAt: null,
    lines: [
      {
        productId: "product-a",
        packages: 3,
        quantityPerPackage: 12_000,
        expectedPackagePriceCents: 1_500_000,
      },
    ],
    ...overrides,
  };
}

function storeWithDraft(order = draft()): FakePurchaseOrderStore {
  const store = new FakePurchaseOrderStore();
  store.seedProduct({ id: "product-a", name: "Yerba", saleUnit: "UNIT", active: true });
  store.seedProduct({ id: "product-b", name: "Harina", saleUnit: "UNIT", active: true });
  store.seedProduct({ id: "product-kg", name: "Azúcar", saleUnit: "KG", active: true });
  store.seedOffer("supplier-a", "product-a", {
    link: { quantity: 12_000, saleUnit: "UNIT", relinkRequired: false },
    priceCents: 1_600_000,
    pricesIncludeVat: true,
    vatRate: null,
  });
  store.seedOffer("supplier-a", "product-b", {
    link: { quantity: 10_000, saleUnit: "UNIT", relinkRequired: false },
    priceCents: 800_000,
    pricesIncludeVat: true,
    vatRate: null,
  });
  store.seedOrder(order);
  return store;
}

function edit(overrides: Partial<EditPurchaseOrderInput> = {}): EditPurchaseOrderInput {
  return {
    locationId: BRANCH,
    orderId: "order-9",
    lines: [{ productId: "product-a", packages: 5, quantityPerPackage: 6_000 }],
    ...overrides,
  };
}

describe("editPurchaseOrder", () => {
  it("replaces the number of packages and the quantity each holds, keeping the line's expected price", async () => {
    const store = storeWithDraft();

    expect(await editPurchaseOrder({ store }, edit())).toEqual({ kind: "edited" });
    expect(store.orders()[0]?.lines).toEqual([
      {
        productId: "product-a",
        packages: 5,
        quantityPerPackage: 6_000,
        expectedPackagePriceCents: 1_500_000,
      },
    ]);
  });

  it("gives an added product the supplier's current list price and removes the lines left out", async () => {
    const store = storeWithDraft();

    const outcome = await editPurchaseOrder(
      { store },
      edit({ lines: [{ productId: "product-b", packages: 2, quantityPerPackage: 10_000 }] }),
    );

    expect(outcome).toEqual({ kind: "edited" });
    expect(store.orders()[0]?.lines).toEqual([
      {
        productId: "product-b",
        packages: 2,
        quantityPerPackage: 10_000,
        expectedPackagePriceCents: 800_000,
      },
    ]);
  });

  it("gives an added product the list price of the supplier's item cheapest per sale unit", async () => {
    const store = storeWithDraft();
    store.seedOffer("supplier-a", "product-b", {
      link: { quantity: 1_000, saleUnit: "UNIT", relinkRequired: false },
      priceCents: 90_000,
      pricesIncludeVat: true,
      vatRate: null,
    });
    store.seedOffer("supplier-a", "product-b", {
      link: { quantity: 20_000, saleUnit: "UNIT", relinkRequired: false },
      priceCents: 1_200_000,
      pricesIncludeVat: true,
      vatRate: null,
    });

    await editPurchaseOrder(
      { store },
      edit({ lines: [{ productId: "product-b", packages: 2, quantityPerPackage: 20_000 }] }),
    );

    expect(store.orders()[0]?.lines[0]?.expectedPackagePriceCents).toBe(1_200_000);
  });

  it("gives an added product the list price of a current item without a comparable price over an outdated one", async () => {
    const store = storeWithDraft();
    store.seedProduct({ id: "product-c", name: "Sal", saleUnit: "UNIT", active: true });
    store.seedOffer("supplier-a", "product-c", {
      link: { quantity: 1_000, saleUnit: "UNIT", relinkRequired: true },
      priceCents: 100,
      pricesIncludeVat: true,
      vatRate: null,
    });
    store.seedOffer("supplier-a", "product-c", {
      link: { quantity: 6_000, saleUnit: "UNIT", relinkRequired: false },
      priceCents: 4_800,
      pricesIncludeVat: false,
      vatRate: null,
    });

    await editPurchaseOrder(
      { store },
      edit({ lines: [{ productId: "product-c", packages: 1, quantityPerPackage: 6_000 }] }),
    );

    expect(store.orders()[0]?.lines[0]?.expectedPackagePriceCents).toBe(4_800);
  });

  it("leaves an added product without an expected price when the supplier has no current offer for it", async () => {
    const store = storeWithDraft();
    store.seedProduct({ id: "product-c", name: "Sal", saleUnit: "UNIT", active: true });
    store.seedOffer("supplier-a", "product-c", {
      link: { quantity: 1_000, saleUnit: "UNIT", relinkRequired: true },
      priceCents: 100,
      pricesIncludeVat: true,
      vatRate: null,
    });

    const outcome = await editPurchaseOrder(
      { store },
      edit({
        lines: [
          { productId: "product-c", packages: 1, quantityPerPackage: 1_000 },
          { productId: "product-kg", packages: 1, quantityPerPackage: 1_000 },
        ],
      }),
    );

    expect(outcome).toEqual({ kind: "edited" });
    expect(store.orders()[0]?.lines.map((line) => line.expectedPackagePriceCents)).toEqual([
      null,
      null,
    ]);
  });

  it("locks the order and then the products in sorted order, in one transaction", async () => {
    const store = storeWithDraft();

    await editPurchaseOrder(
      { store },
      edit({
        lines: [
          { productId: "product-b", packages: 1, quantityPerPackage: 10_000 },
          { productId: "product-a", packages: 1, quantityPerPackage: 12_000 },
        ],
      }),
    );

    expect(store.lockLog).toEqual(["order:order-9", "product:product-a", "product:product-b"]);
    expect(store.transactionCount).toBe(1);
  });

  it("does not find an order of another branch or one that does not exist", async () => {
    const store = storeWithDraft();

    expect(await editPurchaseOrder({ store }, edit({ locationId: "branch-2" }))).toEqual({
      kind: "not_found",
    });
    expect(await editPurchaseOrder({ store }, edit({ orderId: "order-none" }))).toEqual({
      kind: "not_found",
    });
    expect(store.orders()[0]?.lines[0]?.packages).toBe(3);
  });

  it("refuses to edit an order that is not a draft", async () => {
    const store = storeWithDraft(draft({ state: "CANCELLED" }));

    expect(await editPurchaseOrder({ store }, edit())).toEqual({ kind: "not_editable" });
    expect(store.orders()[0]?.lines[0]?.packages).toBe(3);
  });

  it("refuses an order left without lines", async () => {
    const store = storeWithDraft();

    expect(await editPurchaseOrder({ store }, edit({ lines: [] }))).toEqual({ kind: "no_lines" });
    expect(store.transactionCount).toBe(0);
  });

  it("refuses the lines when only some of them have a valid number of packages", async () => {
    const store = storeWithDraft();

    expect(
      await editPurchaseOrder(
        { store },
        edit({
          lines: [
            { productId: "product-a", packages: 1, quantityPerPackage: 12_000 },
            { productId: "product-b", packages: 1.5, quantityPerPackage: 10_000 },
          ],
        }),
      ),
    ).toEqual({ kind: "invalid_package_count" });
    expect(store.orders()[0]?.lines[0]?.packages).toBe(3);
  });

  it.each([0, -2, 2.5, MAX_STOCK_QUANTITY + 1])(
    "refuses %s as a number of packages",
    async (packages) => {
      const store = storeWithDraft();

      expect(
        await editPurchaseOrder(
          { store },
          edit({ lines: [{ productId: "product-a", packages, quantityPerPackage: 12_000 }] }),
        ),
      ).toEqual({ kind: "invalid_package_count" });
    },
  );

  it.each([0, -1_000, 500.5])(
    "refuses %s as the quantity each package holds",
    async (quantityPerPackage) => {
      const store = storeWithDraft();

      expect(
        await editPurchaseOrder(
          { store },
          edit({ lines: [{ productId: "product-a", packages: 1, quantityPerPackage }] }),
        ),
      ).toEqual({ kind: "invalid_quantity_per_package" });
      expect(store.orders()[0]?.lines[0]?.packages).toBe(3);
    },
  );

  it("refuses a fraction of a unit in a package of a product sold by unit, and allows it for one sold by weight", async () => {
    const store = storeWithDraft();

    expect(
      await editPurchaseOrder(
        { store },
        edit({ lines: [{ productId: "product-a", packages: 1, quantityPerPackage: 1_500 }] }),
      ),
    ).toEqual({ kind: "invalid_quantity_per_package" });
    expect(
      await editPurchaseOrder(
        { store },
        edit({ lines: [{ productId: "product-kg", packages: 1, quantityPerPackage: 1_500 }] }),
      ),
    ).toEqual({ kind: "edited" });
  });

  it("refuses a quantity more than a movement can hold", async () => {
    const store = storeWithDraft();

    expect(
      await editPurchaseOrder(
        { store },
        edit({
          lines: [
            { productId: "product-a", packages: MAX_STOCK_QUANTITY, quantityPerPackage: 2_000 },
          ],
        }),
      ),
    ).toEqual({ kind: "invalid_package_count" });
  });

  it("refuses a product that does not exist or is inactive", async () => {
    const store = storeWithDraft();
    store.seedProduct({ id: "product-off", name: "Vieja", saleUnit: "UNIT", active: false });

    for (const productId of ["product-off", "product-none"]) {
      expect(
        await editPurchaseOrder(
          { store },
          edit({ lines: [{ productId, packages: 1, quantityPerPackage: 1_000 }] }),
        ),
      ).toEqual({ kind: "product_not_purchasable", productId });
    }
  });

  it("refuses a product on two lines", async () => {
    const store = storeWithDraft();

    expect(
      await editPurchaseOrder(
        { store },
        edit({
          lines: [
            { productId: "product-a", packages: 1, quantityPerPackage: 1_000 },
            { productId: "product-a", packages: 2, quantityPerPackage: 1_000 },
          ],
        }),
      ),
    ).toEqual({ kind: "duplicate_product", productId: "product-a" });
  });

  it("keeps the draft as it was when a write fails", async () => {
    const store = storeWithDraft();
    store.failWriteAtCall("replacePurchaseOrderLines", 1);

    await expect(editPurchaseOrder({ store }, edit())).rejects.toThrow(
      "replacePurchaseOrderLines failed",
    );
    expect(store.orders()[0]?.lines[0]?.packages).toBe(3);
  });
});

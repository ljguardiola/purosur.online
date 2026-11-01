import { describe, expect, it } from "vitest";
import { MAX_STOCK_QUANTITY } from "../../stock/index.js";
import { type BuildPurchaseOrdersInput, buildPurchaseOrders } from "./build-purchase-orders.js";
import { FakePurchaseOrderStore } from "./test-support/fake-purchase-order-store.js";

const NOW = new Date("2026-03-10T15:00:00Z");
const CLOCK = { now: () => NOW };
const BRANCH = "branch-1";
const ACTOR = "person-1";

function supplier(id: string, active = true) {
  return { id, name: `Proveedor ${id}`, cuit: null, contact: null, note: null, active, version: 1 };
}

function currentOffer(quantity: number, packagePriceCents: number) {
  return {
    link: { quantity, saleUnit: "UNIT" as const, relinkRequired: false },
    packagePriceCents,
  };
}

function storeWithCatalog(): FakePurchaseOrderStore {
  const store = new FakePurchaseOrderStore();
  store.seedSupplier(supplier("supplier-a"));
  store.seedSupplier(supplier("supplier-b"));
  store.seedProduct({ id: "product-a", name: "Yerba", saleUnit: "UNIT", active: true });
  store.seedProduct({ id: "product-b", name: "Harina", saleUnit: "UNIT", active: true });
  store.seedOffer("supplier-a", "product-a", currentOffer(12_000, 1_500_000));
  store.seedOffer("supplier-a", "product-b", currentOffer(10_000, 800_000));
  store.seedOffer("supplier-b", "product-a", currentOffer(6_000, 800_000));
  return store;
}

function build(overrides: Partial<BuildPurchaseOrdersInput> = {}): BuildPurchaseOrdersInput {
  return {
    locationId: BRANCH,
    actorId: ACTOR,
    choices: [{ productId: "product-a", supplierId: "supplier-a", packages: 3 }],
    ...overrides,
  };
}

describe("buildPurchaseOrders", () => {
  it("creates a draft order with the link's quantity per package and the list's package price", async () => {
    const store = storeWithCatalog();

    const outcome = await buildPurchaseOrders({ store, clock: CLOCK }, build());

    expect(outcome).toEqual({ kind: "created", orderIds: ["order-1"] });
    expect(store.orders()).toEqual([
      {
        id: "order-1",
        supplierId: "supplier-a",
        locationId: BRANCH,
        state: "DRAFT",
        createdAt: NOW,
        actorId: ACTOR,
        cancelledAt: null,
        lines: [
          {
            productId: "product-a",
            packages: 3,
            quantityPerPackage: 12_000,
            expectedPackagePriceCents: 1_500_000,
          },
        ],
      },
    ]);
  });

  it("groups the choices of one supplier in one order and makes one order per supplier", async () => {
    const store = storeWithCatalog();

    const outcome = await buildPurchaseOrders(
      { store, clock: CLOCK },
      build({
        choices: [
          { productId: "product-a", supplierId: "supplier-b", packages: 1 },
          { productId: "product-b", supplierId: "supplier-a", packages: 2 },
          { productId: "product-a", supplierId: "supplier-a", packages: 4 },
        ],
      }),
    );

    expect(outcome).toEqual({ kind: "created", orderIds: ["order-1", "order-2"] });
    expect(
      store.orders().map(({ supplierId, lines }) => [
        supplierId,
        lines.map(({ productId, packages, quantityPerPackage, expectedPackagePriceCents }) => [
          productId,
          packages,
          quantityPerPackage,
          expectedPackagePriceCents,
        ]),
      ]),
    ).toEqual([
      [
        "supplier-a",
        [
          ["product-b", 2, 10_000, 800_000],
          ["product-a", 4, 12_000, 1_500_000],
        ],
      ],
      ["supplier-b", [["product-a", 1, 6_000, 800_000]]],
    ]);
  });

  it("locks the suppliers and then the products, each in sorted order, in one transaction", async () => {
    const store = storeWithCatalog();

    await buildPurchaseOrders(
      { store, clock: CLOCK },
      build({
        choices: [
          { productId: "product-b", supplierId: "supplier-b", packages: 1 },
          { productId: "product-a", supplierId: "supplier-a", packages: 1 },
          { productId: "product-b", supplierId: "supplier-a", packages: 1 },
        ],
      }),
    );

    expect(store.lockLog).toEqual([
      "supplier:supplier-a",
      "supplier:supplier-b",
      "product:product-a",
      "product:product-b",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("refuses to build without choices", async () => {
    const store = storeWithCatalog();

    expect(await buildPurchaseOrders({ store, clock: CLOCK }, build({ choices: [] }))).toEqual({
      kind: "no_choices",
    });
    expect(store.transactionCount).toBe(0);
  });

  it.each([0, -1, 1.5, MAX_STOCK_QUANTITY + 1])(
    "refuses %s as a number of packages",
    async (packages) => {
      const store = storeWithCatalog();

      expect(
        await buildPurchaseOrders(
          { store, clock: CLOCK },
          build({ choices: [{ productId: "product-a", supplierId: "supplier-a", packages }] }),
        ),
      ).toEqual({ kind: "invalid_package_count" });
      expect(store.orders()).toEqual([]);
    },
  );

  it("refuses a number of packages whose quantity is more than a movement can hold", async () => {
    const store = storeWithCatalog();

    expect(
      await buildPurchaseOrders(
        { store, clock: CLOCK },
        build({
          choices: [{ productId: "product-a", supplierId: "supplier-a", packages: MAX_STOCK_QUANTITY }],
        }),
      ),
    ).toEqual({ kind: "invalid_package_count" });
    expect(store.orders()).toEqual([]);
  });

  it("refuses a supplier that does not exist or is inactive", async () => {
    const store = storeWithCatalog();
    store.seedSupplier(supplier("supplier-off", false));

    for (const supplierId of ["supplier-off", "supplier-none"]) {
      expect(
        await buildPurchaseOrders(
          { store, clock: CLOCK },
          build({ choices: [{ productId: "product-a", supplierId, packages: 1 }] }),
        ),
      ).toEqual({ kind: "supplier_not_purchasable", supplierId });
    }
    expect(store.orders()).toEqual([]);
  });

  it("refuses a product that does not exist or is inactive", async () => {
    const store = storeWithCatalog();
    store.seedProduct({ id: "product-off", name: "Vieja", saleUnit: "UNIT", active: false });

    for (const productId of ["product-off", "product-none"]) {
      expect(
        await buildPurchaseOrders(
          { store, clock: CLOCK },
          build({ choices: [{ productId, supplierId: "supplier-a", packages: 1 }] }),
        ),
      ).toEqual({ kind: "product_not_purchasable", productId });
    }
    expect(store.orders()).toEqual([]);
  });

  it("refuses a product the supplier has no item linked to", async () => {
    const store = storeWithCatalog();

    expect(
      await buildPurchaseOrders(
        { store, clock: CLOCK },
        build({ choices: [{ productId: "product-b", supplierId: "supplier-b", packages: 1 }] }),
      ),
    ).toEqual({ kind: "offer_unavailable", productId: "product-b", supplierId: "supplier-b" });
  });

  it("refuses an offer whose link must be made again or is in another sale unit", async () => {
    const store = storeWithCatalog();
    store.seedProduct({ id: "product-kg", name: "Azúcar", saleUnit: "KG", active: true });
    store.seedOffer("supplier-a", "product-kg", {
      link: { quantity: 1_000, saleUnit: "UNIT", relinkRequired: false },
      packagePriceCents: 100,
    });
    store.seedProduct({ id: "product-relink", name: "Sal", saleUnit: "UNIT", active: true });
    store.seedOffer("supplier-a", "product-relink", {
      link: { quantity: 1_000, saleUnit: "UNIT", relinkRequired: true },
      packagePriceCents: 100,
    });

    for (const productId of ["product-kg", "product-relink"]) {
      expect(
        await buildPurchaseOrders(
          { store, clock: CLOCK },
          build({ choices: [{ productId, supplierId: "supplier-a", packages: 1 }] }),
        ),
      ).toEqual({ kind: "offer_unavailable", productId, supplierId: "supplier-a" });
    }
    expect(store.orders()).toEqual([]);
  });

  it("leaves no order behind when a write fails", async () => {
    const store = storeWithCatalog();
    store.failWriteAtCall("insertPurchaseOrderLine", 2);

    await expect(
      buildPurchaseOrders(
        { store, clock: CLOCK },
        build({
          choices: [
            { productId: "product-a", supplierId: "supplier-a", packages: 1 },
            { productId: "product-b", supplierId: "supplier-a", packages: 1 },
          ],
        }),
      ),
    ).rejects.toThrow("insertPurchaseOrderLine failed");
    expect(store.orders()).toEqual([]);
  });

  it("refuses a product chosen twice for the same supplier", async () => {
    const store = storeWithCatalog();

    expect(
      await buildPurchaseOrders(
        { store, clock: CLOCK },
        build({
          choices: [
            { productId: "product-a", supplierId: "supplier-a", packages: 1 },
            { productId: "product-a", supplierId: "supplier-a", packages: 2 },
          ],
        }),
      ),
    ).toEqual({ kind: "duplicate_product", productId: "product-a" });
    expect(store.orders()).toEqual([]);
  });
});

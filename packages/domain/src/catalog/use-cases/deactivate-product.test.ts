import { describe, expect, it } from "vitest";
import { deactivateProduct } from "./deactivate-product.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("deactivateProduct", () => {
  it("answers not_found for an id that doesn't exist", async () => {
    const store = new FakeCatalogStore();

    const outcome = await deactivateProduct(store, "missing");

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("answers not_found for a product that is already inactive", async () => {
    const store = new FakeCatalogStore();
    store.seedProduct(
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: false,
        version: 2,
      },
      [{ code: "111", active: false }],
    );

    const outcome = await deactivateProduct(store, "product-1");

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("deactivates the product and its barcodes, bumping the version", async () => {
    const store = new FakeCatalogStore();
    store.seedProduct(
      {
        id: "decoy",
        name: "Decoy",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 9,
      },
      [{ code: "900" }],
    );
    store.seedProduct(
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 3,
      },
      [{ code: "111" }],
    );

    const outcome = await deactivateProduct(store, "product-1");

    expect(outcome).toEqual({ kind: "deactivated" });
    expect(
      store.snapshot().products.map(({ id, active, version }) => ({ id, active, version })),
    ).toEqual([
      { id: "decoy", active: true, version: 9 },
      { id: "product-1", active: false, version: 4 },
    ]);
    expect(store.snapshot().barcodes).toEqual([
      { productId: "decoy", code: "900", active: true },
      { productId: "product-1", code: "111", active: false },
    ]);
    expect(store.lockCallOrder).toEqual(["lockProduct"]);

    const secondAttempt = await deactivateProduct(store, "product-1");
    expect(secondAttempt).toEqual({ kind: "not_found" });
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    store.seedProduct(
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "111" }],
    );

    await deactivateProduct(store, "product-1");

    expect(store.transactionCount).toBe(1);
  });
});

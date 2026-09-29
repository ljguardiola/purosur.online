import { describe, expect, it } from "vitest";
import { deactivateBrand } from "./deactivate-brand.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

describe("deactivateBrand", () => {
  it("answers not_found for an id that doesn't exist", async () => {
    const store = new FakeCatalogStore();

    const outcome = await deactivateBrand(store, "missing");

    expect(outcome).toEqual({ kind: "not_found" });
  });

  it("answers already_inactive for a brand that is already inactive, changing nothing", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "Granix", active: false, version: 2 });

    const outcome = await deactivateBrand(store, "brand-1");

    expect(outcome).toEqual({ kind: "already_inactive" });
    expect(store.snapshot().brands).toEqual([
      { id: "brand-1", name: "Granix", active: false, version: 2 },
    ]);
  });

  it("deactivates the brand, bumping the version, and leaves the products that carry it untouched", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "decoy", name: "Decoy", active: true, version: 9 });
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 3 });
    store.seedProduct(
      {
        id: "product-1",
        name: "Galletitas",
        categoryId: "category-1",
        brandId: "brand-1",
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "111" }],
    );
    const productsBefore = store.snapshot().products;

    const outcome = await deactivateBrand(store, "brand-1");

    expect(outcome).toEqual({ kind: "deactivated" });
    expect(store.snapshot().brands).toEqual([
      { id: "decoy", name: "Decoy", active: true, version: 9 },
      { id: "brand-1", name: "Granix", active: false, version: 4 },
    ]);
    expect(store.snapshot().products).toEqual(productsBefore);
    expect(store.lockCallOrder).toEqual(["lockBrand"]);
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });

    await deactivateBrand(store, "brand-1");

    expect(store.transactionCount).toBe(1);
  });
});

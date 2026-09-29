import { describe, expect, it, vi } from "vitest";
import { editProduct } from "./edit-product.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

function leafCategory(store: FakeCatalogStore, id = "category-1", name = "Almacén"): void {
  store.seedCategory({ id, name, parentId: null, version: 1 });
}

function activeProduct(
  store: FakeCatalogStore,
  overrides: Partial<{ id: string; categoryId: string; version: number; active: boolean }> = {},
): void {
  store.seedProduct(
    {
      id: overrides.id ?? "product-1",
      name: "Yerba",
      categoryId: overrides.categoryId ?? "category-1",
      brandId: null,
      saleUnit: "UNIT",
      netContent: null,
      active: overrides.active ?? true,
      version: overrides.version ?? 1,
    },
    [{ code: "111", active: overrides.active ?? true }],
  );
}

function decoyProduct(store: FakeCatalogStore): void {
  store.seedProduct(
    {
      id: "decoy",
      name: "Decoy",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "KG",
      netContent: { quantity: 1, unit: "L" },
      active: true,
      version: 7,
    },
    [{ code: "900" }],
  );
}

function brandedProduct(store: FakeCatalogStore, brandId: string): void {
  store.seedProduct(
    {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId,
      saleUnit: "UNIT",
      netContent: null,
      active: true,
      version: 1,
    },
    [{ code: "111" }],
  );
}

describe("editProduct", () => {
  it("answers stale_version for a row that is missing when it is locked", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);

    const outcome = await editProduct(store, {
      id: "missing",
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "stale_version" });
  });

  it("rejects a stale version", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store, { version: 2 });

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "stale_version" });
  });

  it("rejects a categoryId that does not exist", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "missing",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "category_not_found" });
  });

  it("rejects a categoryId that has subcategories of its own", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store, "parent");
    store.seedCategory({ id: "child", name: "Yerbas", parentId: "parent", version: 1 });
    activeProduct(store);

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "parent",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "category_not_leaf" });
  });

  it("rejects a barcode held by another active product", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);
    store.seedProduct(
      {
        id: "other",
        name: "Otro",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "222" }],
    );

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["222"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "barcode_taken", codes: ["222"] });
  });

  it("lets a product keep one of its own codes unchanged", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome.kind).toBe("applied");
  });

  it("skips the active-barcode check for an inactive product, and hands its replaced barcodes to the store for the product it locked", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedProduct(
      {
        id: "other",
        name: "Otro",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "222" }],
    );
    activeProduct(store, { active: false });

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["222"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({
      kind: "applied",
      product: expect.objectContaining({ active: false, barcodes: ["222"] }),
    });
    expect(await store.activeBarcodesTaken(["222"])).toEqual(["222"]);
    expect(store.barcodeReplacements).toEqual([
      { product: { id: "product-1", version: 1, active: false, brandId: null }, barcodes: ["222"] },
    ]);
  });

  it("applies the edit, bumping the version and moving category", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store, "category-1", "Almacén");
    leafCategory(store, "category-2", "Bebidas");
    decoyProduct(store);
    activeProduct(store);

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba Mate",
      categoryId: "category-2",
      brandId: null,
      saleUnit: "KG",
      barcodes: ["333"],
      netContent: { quantity: 0.5, unit: "KG" },
      version: 1,
    });

    expect(outcome).toEqual({
      kind: "applied",
      product: {
        id: "product-1",
        name: "Yerba Mate",
        categoryId: "category-2",
        brandId: null,
        categoryName: "Bebidas",
        saleUnit: "KG",
        barcodes: ["333"],
        netContent: { quantity: 0.5, unit: "KG" },
        active: true,
        version: 2,
      },
    });
    expect(store.snapshot().products).toEqual([
      {
        id: "decoy",
        name: "Decoy",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "KG",
        netContent: { quantity: 1, unit: "L" },
        active: true,
        version: 7,
      },
      {
        id: "product-1",
        name: "Yerba Mate",
        categoryId: "category-2",
        brandId: null,
        saleUnit: "KG",
        netContent: { quantity: 0.5, unit: "KG" },
        active: true,
        version: 2,
      },
    ]);
    expect(store.snapshot().barcodes).toEqual([
      { productId: "decoy", code: "900", active: true },
      { productId: "product-1", code: "333", active: true },
    ]);
    expect(store.lockCallOrder).toEqual(["lockProduct", "lockLeafCategory"]);
  });

  it("gives the product an active brand, locking the product, its category and then the brand", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });
    activeProduct(store);

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: "brand-1",
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toMatchObject({ kind: "applied", product: { brandId: "brand-1", version: 2 } });
    expect(store.snapshot().products).toMatchObject([{ id: "product-1", brandId: "brand-1" }]);
    expect(store.lockCallOrder).toEqual(["lockProduct", "lockLeafCategory", "lockBrand"]);
  });

  it("removes the product's brand when saved with none", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });
    brandedProduct(store, "brand-1");

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toMatchObject({ kind: "applied", product: { brandId: null } });
    expect(store.snapshot().products).toMatchObject([{ id: "product-1", brandId: null }]);
    expect(store.lockCallOrder).toEqual(["lockProduct", "lockLeafCategory"]);
  });

  it("lets a product keep the deactivated brand it already carries", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Yerba del Litoral", active: false, version: 2 });
    brandedProduct(store, "brand-1");

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Miel pura de abeja 1 kg",
      categoryId: "category-1",
      brandId: "brand-1",
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toMatchObject({
      kind: "applied",
      product: { name: "Miel pura de abeja 1 kg", brandId: "brand-1" },
    });
    expect(store.snapshot().products).toMatchObject([
      { id: "product-1", name: "Miel pura de abeja 1 kg", brandId: "brand-1" },
    ]);
  });

  it("rejects moving a product to a deactivated brand it doesn't carry, changing nothing", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });
    store.seedBrand({ id: "brand-2", name: "Yerba del Litoral", active: false, version: 2 });
    brandedProduct(store, "brand-1");

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba Mate",
      categoryId: "category-1",
      brandId: "brand-2",
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "brand_inactive" });
    expect(store.snapshot().products).toMatchObject([
      { id: "product-1", name: "Yerba", brandId: "brand-1", version: 1 },
    ]);
  });

  it("rejects a deactivated brand for a product that carries no brand", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-2", name: "Yerba del Litoral", active: false, version: 2 });
    activeProduct(store);

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: "brand-2",
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "brand_inactive" });
  });

  it("rejects a brandId that does not exist", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: "missing",
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "brand_not_found" });
  });

  it("checks the brand before the barcodes", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    decoyProduct(store);
    activeProduct(store);

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: "missing",
      saleUnit: "UNIT",
      barcodes: ["900"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "brand_not_found" });
  });

  it("maps a barcode race caught by the store's write to barcode_taken, re-reading only the codes another product holds", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);
    store.barcodeConflicts.set("222", "winner");
    store.barcodeConflicts.set("333", "product-1");
    store.barcodeConflicts.set("444", "winner");

    const outcome = await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111", "222", "333"],
      netContent: null,
      version: 1,
    });

    expect(outcome).toEqual({ kind: "barcode_taken", codes: ["222"] });
    expect(store.snapshot().products[0]?.version).toBe(1);
  });

  it("lets an error that is not a barcode conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(
      editProduct(store, {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        netContent: null,
        version: 1,
      }),
    ).rejects.toThrow("connection lost");
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);

    await editProduct(store, {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      netContent: null,
      version: 1,
    });

    expect(store.transactionCount).toBe(1);
  });
});

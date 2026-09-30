import { describe, expect, it, vi } from "vitest";
import { createProduct } from "./create-product.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

function leafCategory(store: FakeCatalogStore, id = "category-1", name = "Almacén"): void {
  store.seedCategory({ id, name, parentId: null, version: 1 });
}

describe("createProduct", () => {
  it("rejects a categoryId that does not exist", async () => {
    const store = new FakeCatalogStore();

    const outcome = await createProduct(store, {
      name: "Yerba",
      categoryId: "missing",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "category_not_found" });
  });

  it("rejects a categoryId that has subcategories of its own", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store, "parent", "Almacén");
    store.seedCategory({ id: "child", name: "Yerbas", parentId: "parent", version: 1 });

    const outcome = await createProduct(store, {
      name: "Yerba",
      categoryId: "parent",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "category_not_leaf" });
  });

  it("rejects a barcode already active on another product", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedProduct(
      {
        id: "existing",
        name: "Otro",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "111" }],
    );

    const outcome = await createProduct(store, {
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "barcode_taken", codes: ["111"] });
  });

  it("accepts a barcode held only by an inactive product's barcode", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedProduct(
      {
        id: "existing",
        name: "Otro",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: false,
        version: 1,
      },
      [{ code: "111", active: false }],
    );

    const outcome = await createProduct(store, {
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome.kind).toBe("created");
  });

  it("maps a barcode race caught by the store's insert to barcode_taken, with the codes re-read outside the rolled-back transaction", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.barcodeConflicts.set("111", "winner");

    const outcome = await createProduct(store, {
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "barcode_taken", codes: ["111"] });
  });

  it("creates the product with its barcodes, starting active at version 1", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store, "decoy", "Otra");
    leafCategory(store, "category-1", "Almacén");

    const outcome = await createProduct(store, {
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "KG",
      barcodes: ["111", "222"],
      tagIds: [],
      netContent: { quantity: 0.5, unit: "KG" },
    });

    expect(outcome).toEqual({
      kind: "created",
      product: {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        categoryName: "Almacén",
        saleUnit: "KG",
        barcodes: ["111", "222"],
        tagIds: [],
        netContent: { quantity: 0.5, unit: "KG" },
        active: true,
        version: 1,
      },
    });
    expect(store.snapshot().products).toEqual([
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "KG",
        netContent: { quantity: 0.5, unit: "KG" },
        active: true,
        version: 1,
      },
    ]);
    expect(await store.activeBarcodesTaken(["111", "222"])).toEqual(["111", "222"]);
  });

  it("creates the product with the active brand it was given", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "decoy", name: "Decoy", active: true, version: 1 });
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 4 });

    const outcome = await createProduct(store, {
      name: "Galletitas",
      categoryId: "category-1",
      brandId: "brand-1",
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toMatchObject({ kind: "created", product: { brandId: "brand-1" } });
    expect(store.snapshot().products).toMatchObject([{ id: "product-1", brandId: "brand-1" }]);
    expect(store.snapshot().brands).toContainEqual({
      id: "brand-1",
      name: "Granix",
      active: true,
      version: 4,
    });
    expect(store.lockCallOrder).toEqual(["lockLeafCategory", "lockBrand"]);
  });

  it("creates the product with no brand when none was given, locking no brand", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);

    const outcome = await createProduct(store, {
      name: "Dátiles sueltos",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "KG",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toMatchObject({ kind: "created", product: { brandId: null } });
    expect(store.snapshot().products).toMatchObject([{ brandId: null }]);
    expect(store.lockCallOrder).toEqual(["lockLeafCategory"]);
  });

  it("rejects a brandId that does not exist, creating nothing", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);

    const outcome = await createProduct(store, {
      name: "Galletitas",
      categoryId: "category-1",
      brandId: "missing",
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "brand_not_found" });
    expect(store.snapshot().products).toEqual([]);
  });

  it("rejects a deactivated brand, creating nothing", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Yerba del Litoral", active: false, version: 2 });

    const outcome = await createProduct(store, {
      name: "Yerba",
      categoryId: "category-1",
      brandId: "brand-1",
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "brand_inactive" });
    expect(store.snapshot().products).toEqual([]);
  });

  it("checks the category before the brand", async () => {
    const store = new FakeCatalogStore();

    const outcome = await createProduct(store, {
      name: "Yerba",
      categoryId: "missing",
      brandId: "missing",
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "category_not_found" });
  });

  it("checks the brand before the barcodes", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedProduct(
      {
        id: "existing",
        name: "Otro",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "111" }],
    );

    const outcome = await createProduct(store, {
      name: "Yerba",
      categoryId: "category-1",
      brandId: "missing",
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "brand_not_found" });
  });

  it("gives each created product its own id", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    const input = {
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT" as const,
      netContent: null,
      tagIds: [],
    };

    const first = await createProduct(store, { ...input, barcodes: ["111"] });
    const second = await createProduct(store, { ...input, barcodes: ["222"] });

    expect(
      [first, second].map((outcome) => outcome.kind === "created" && outcome.product.id),
    ).toEqual(["product-1", "product-2"]);
  });

  it("locks the leaf category once, inside the transaction", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);

    await createProduct(store, {
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(store.lockCallOrder).toEqual(["lockLeafCategory"]);
  });

  it("lets an error that is not a barcode conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(
      createProduct(store, {
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
      }),
    ).rejects.toThrow("connection lost");
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);

    await createProduct(store, {
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(store.transactionCount).toBe(1);
  });

  it("leaves no product behind when the race rolls the transaction back", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.barcodeConflicts.set("222", "winner");

    await createProduct(store, {
      name: "Yerba",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111", "222"],
      tagIds: [],
      netContent: null,
    });

    expect(store.snapshot().products).toEqual([]);
    expect(store.snapshot().barcodes).toEqual([]);
  });

  it("creates the product with the tags it was given, in the order given", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedTag({ id: "tag-9", name: "Vegano", active: true, version: 1 });
    store.seedTag({ id: "tag-2", name: "Sin TACC", active: true, version: 3 });
    store.seedTag({ id: "decoy", name: "Decoy", active: true, version: 1 });

    const outcome = await createProduct(store, {
      name: "Galletitas",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: ["tag-9", "tag-2"],
      netContent: null,
    });

    expect(outcome).toMatchObject({ kind: "created", product: { tagIds: ["tag-9", "tag-2"] } });
    expect(store.snapshot().productTags).toEqual([
      { productId: "product-1", tagId: "tag-9" },
      { productId: "product-1", tagId: "tag-2" },
    ]);
    expect(store.snapshot().tags).toContainEqual({
      id: "tag-2",
      name: "Sin TACC",
      active: true,
      version: 3,
    });
  });

  it("locks the tags in id order whatever order they were given, after the category and the brand", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });
    for (const id of ["tag-1", "tag-2", "tag-3"]) {
      store.seedTag({ id, name: id, active: true, version: 1 });
    }

    await createProduct(store, {
      name: "Galletitas",
      categoryId: "category-1",
      brandId: "brand-1",
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: ["tag-3", "tag-1", "tag-2"],
      netContent: null,
    });

    expect(store.lockCallOrder).toEqual([
      "lockLeafCategory",
      "lockBrand",
      "lockTag",
      "lockTag",
      "lockTag",
    ]);
    expect(store.lockedTagIds).toEqual(["tag-1", "tag-2", "tag-3"]);
  });

  it("creates the product with no tags when none were given, locking no tag", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);

    const outcome = await createProduct(store, {
      name: "Dátiles sueltos",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "KG",
      barcodes: ["111"],
      tagIds: [],
      netContent: null,
    });

    expect(outcome).toMatchObject({ kind: "created", product: { tagIds: [] } });
    expect(store.snapshot().productTags).toEqual([]);
    expect(store.lockCallOrder).toEqual(["lockLeafCategory"]);
  });

  it("rejects a tag that does not exist, creating nothing", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 1 });

    const outcome = await createProduct(store, {
      name: "Galletitas",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: ["tag-1", "missing"],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "tag_not_found" });
    expect(store.snapshot().products).toEqual([]);
    expect(store.snapshot().productTags).toEqual([]);
  });

  it("rejects a deactivated tag, creating nothing", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 1 });
    store.seedTag({ id: "tag-2", name: "Vegano", active: false, version: 2 });

    const outcome = await createProduct(store, {
      name: "Galletitas",
      categoryId: "category-1",
      brandId: null,
      saleUnit: "UNIT",
      barcodes: ["111"],
      tagIds: ["tag-1", "tag-2"],
      netContent: null,
    });

    expect(outcome).toEqual({ kind: "tag_inactive", tagId: "tag-2" });
    expect(store.snapshot().products).toEqual([]);
  });

  it("checks the brand before the tags, and the tags before the barcodes", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedProduct(
      {
        id: "existing",
        name: "Otro",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "111" }],
    );
    const input = {
      name: "Galletitas",
      categoryId: "category-1",
      saleUnit: "UNIT" as const,
      barcodes: ["111"],
      netContent: null,
    };

    expect(
      await createProduct(store, { ...input, brandId: "missing", tagIds: ["missing"] }),
    ).toEqual({ kind: "brand_not_found" });
    expect(await createProduct(store, { ...input, brandId: null, tagIds: ["missing"] })).toEqual({
      kind: "tag_not_found",
    });
  });
});

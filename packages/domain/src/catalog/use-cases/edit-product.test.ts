import { describe, expect, it, vi } from "vitest";
import { editProduct } from "./edit-product.js";
import { FakeCatalogStore } from "./test-support/fake-catalog-store.js";

const clock = { now: () => new Date("2026-06-15T15:00:00Z") };

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

function taggedProduct(store: FakeCatalogStore, tagIds: string[]): void {
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
    tagIds,
  );
}

describe("editProduct", () => {
  it("answers not_found for a product that is missing when it is locked, changing nothing", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "missing",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot().products).toEqual([]);
  });

  it("rejects a stale version", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store, { version: 2 });

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "stale_version" });
  });

  it("rejects a categoryId that does not exist", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "missing",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "category_not_found" });
  });

  it("rejects a categoryId that has subcategories of its own", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store, "parent");
    store.seedCategory({ id: "child", name: "Yerbas", parentId: "parent", version: 1 });
    activeProduct(store);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "parent",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

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

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["222"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "barcode_taken", codes: ["222"] });
  });

  it("lets a product keep one of its own codes unchanged", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

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

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["222"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({
      kind: "applied",
      product: expect.objectContaining({ active: false, barcodes: ["222"] }),
    });
    expect(await store.activeBarcodesTaken(["222"])).toEqual(["222"]);
    expect(store.barcodeReplacements).toEqual([
      {
        product: {
          id: "product-1",
          version: 1,
          active: false,
          brandId: null,
          saleUnit: "UNIT",
          tagIds: [],
        },
        barcodes: ["222"],
      },
    ]);
  });

  it("applies the edit, bumping the version and moving category", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store, "category-1", "Almacén");
    leafCategory(store, "category-2", "Bebidas");
    decoyProduct(store);
    activeProduct(store);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba Mate",
        categoryId: "category-2",
        brandId: null,
        saleUnit: "KG",
        barcodes: ["333"],
        tagIds: [],
        netContent: { quantity: 0.5, unit: "KG" },
        version: 1,
      },
    );

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
        tagIds: [],
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
    expect(store.lockCallOrder).toEqual(["lockProduct", "buyNPayMDiscountsOn", "lockLeafCategory"]);
  });

  it("gives the product an active brand, locking the product, its category and then the brand", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });
    activeProduct(store);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: "brand-1",
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toMatchObject({ kind: "applied", product: { brandId: "brand-1", version: 2 } });
    expect(store.snapshot().products).toMatchObject([{ id: "product-1", brandId: "brand-1" }]);
    expect(store.lockCallOrder).toEqual(["lockProduct", "lockLeafCategory", "lockBrand"]);
  });

  it("removes the product's brand when saved with none", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });
    brandedProduct(store, "brand-1");

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toMatchObject({ kind: "applied", product: { brandId: null } });
    expect(store.snapshot().products).toMatchObject([{ id: "product-1", brandId: null }]);
    expect(store.lockCallOrder).toEqual(["lockProduct", "lockLeafCategory"]);
  });

  it("lets a product keep the deactivated brand it already carries", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Yerba del Litoral", active: false, version: 2 });
    brandedProduct(store, "brand-1");

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Miel pura de abeja 1 kg",
        categoryId: "category-1",
        brandId: "brand-1",
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

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

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba Mate",
        categoryId: "category-1",
        brandId: "brand-2",
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

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

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: "brand-2",
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "brand_inactive" });
  });

  it("rejects a brandId that does not exist", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: "missing",
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "brand_not_found" });
  });

  it("checks the brand before the barcodes", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    decoyProduct(store);
    activeProduct(store);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: "missing",
        saleUnit: "UNIT",
        barcodes: ["900"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "brand_not_found" });
  });

  it("maps a barcode race caught by the store's write to barcode_taken, re-reading only the codes another product holds", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);
    store.barcodeConflicts.set("222", "winner");
    store.barcodeConflicts.set("333", "product-1");
    store.barcodeConflicts.set("444", "winner");

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111", "222", "333"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "barcode_taken", codes: ["222"] });
    expect(store.snapshot().products[0]?.version).toBe(1);
  });

  it("lets an error that is not a barcode conflict through", async () => {
    const store = new FakeCatalogStore();
    vi.spyOn(store, "transaction").mockRejectedValue(new Error("connection lost"));

    await expect(
      editProduct(
        { store, clock },
        {
          id: "product-1",
          name: "Yerba",
          categoryId: "category-1",
          brandId: null,
          saleUnit: "UNIT",
          barcodes: ["111"],
          tagIds: [],
          netContent: null,
          version: 1,
        },
      ),
    ).rejects.toThrow("connection lost");
  });

  it("runs entirely inside one transaction", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);

    await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(store.transactionCount).toBe(1);
  });

  it("replaces the product's tags with the ones sent, locking them in id order after the brand", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedBrand({ id: "brand-1", name: "Granix", active: true, version: 1 });
    for (const id of ["tag-1", "tag-2", "tag-3"]) {
      store.seedTag({ id, name: id, active: true, version: 1 });
    }
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
      ["tag-1", "tag-2"],
    );
    store.seedProduct(
      {
        id: "decoy",
        name: "Decoy",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "900" }],
      ["tag-1"],
    );

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: "brand-1",
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: ["tag-3", "tag-2"],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toMatchObject({ kind: "applied", product: { tagIds: ["tag-3", "tag-2"] } });
    expect(store.snapshot().productTags).toEqual([
      { productId: "decoy", tagId: "tag-1" },
      { productId: "product-1", tagId: "tag-3" },
      { productId: "product-1", tagId: "tag-2" },
    ]);
    expect(store.lockCallOrder).toEqual([
      "lockProduct",
      "lockLeafCategory",
      "lockBrand",
      "lockTag",
      "lockTag",
    ]);
    expect(store.lockedTagIds).toEqual(["tag-2", "tag-3"]);
  });

  it("removes every tag when saved with none, locking no tag", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 1 });
    taggedProduct(store, ["tag-1"]);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: [],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toMatchObject({ kind: "applied", product: { tagIds: [] } });
    expect(store.snapshot().productTags).toEqual([]);
    expect(store.lockCallOrder).toEqual(["lockProduct", "lockLeafCategory"]);
  });

  it("lets a product keep a deactivated tag it already carries while it takes an active one", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: false, version: 2 });
    store.seedTag({ id: "tag-2", name: "Vegano", active: true, version: 1 });
    taggedProduct(store, ["tag-1"]);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: ["tag-1", "tag-2"],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toMatchObject({ kind: "applied", product: { tagIds: ["tag-1", "tag-2"] } });
    expect(store.snapshot().productTags).toEqual([
      { productId: "product-1", tagId: "tag-1" },
      { productId: "product-1", tagId: "tag-2" },
    ]);
  });

  it("rejects a deactivated tag the product does not carry, changing nothing", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: true, version: 1 });
    store.seedTag({ id: "tag-2", name: "Vegano", active: false, version: 2 });
    taggedProduct(store, ["tag-1"]);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba nueva",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: ["tag-1", "tag-2"],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "tag_inactive", tagId: "tag-2" });
    expect(store.snapshot().products).toMatchObject([{ name: "Yerba", version: 1 }]);
    expect(store.snapshot().productTags).toEqual([{ productId: "product-1", tagId: "tag-1" }]);
  });

  it("rejects a tag that does not exist", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    activeProduct(store);

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: ["missing"],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "tag_not_found" });
  });

  it("checks the brand before the tags, and the tags before the barcodes", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    decoyProduct(store);
    activeProduct(store);
    const input = {
      id: "product-1",
      name: "Yerba",
      categoryId: "category-1",
      saleUnit: "UNIT" as const,
      barcodes: ["900"],
      netContent: null,
      version: 1,
    };

    expect(
      await editProduct({ store, clock }, { ...input, brandId: "missing", tagIds: ["missing"] }),
    ).toEqual({ kind: "brand_not_found" });
    expect(
      await editProduct({ store, clock }, { ...input, brandId: null, tagIds: ["missing"] }),
    ).toEqual({
      kind: "tag_not_found",
    });
  });

  it("does not let a product keep a deactivated tag that only another product carries", async () => {
    const store = new FakeCatalogStore();
    leafCategory(store);
    store.seedTag({ id: "tag-1", name: "Sin TACC", active: false, version: 2 });
    activeProduct(store);
    store.seedProduct(
      {
        id: "decoy",
        name: "Decoy",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        netContent: null,
        active: true,
        version: 1,
      },
      [{ code: "900" }],
      ["tag-1"],
    );

    const outcome = await editProduct(
      { store, clock },
      {
        id: "product-1",
        name: "Yerba",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["111"],
        tagIds: ["tag-1"],
        netContent: null,
        version: 1,
      },
    );

    expect(outcome).toEqual({ kind: "tag_inactive", tagId: "tag-1" });
  });

  describe("changing the sale unit from unit to weight", () => {
    function unitProductWithDiscount(
      discount: Partial<{
        name: string;
        active: boolean;
        validFrom: string;
        validTo: string;
        kind: "BUY_N_PAY_M" | "PERCENT_OFF";
        productId: string;
      }> = {},
    ): FakeCatalogStore {
      const store = new FakeCatalogStore();
      leafCategory(store);
      activeProduct(store);
      store.seedDiscount({
        id: "discount-1",
        name: discount.name ?? "3x2 Yerba",
        kind: discount.kind ?? "BUY_N_PAY_M",
        productId: discount.productId ?? "product-1",
        active: discount.active ?? true,
        validFrom: discount.validFrom ?? "2026-06-01",
        validTo: discount.validTo ?? "2026-06-30",
      });
      return store;
    }

    function edit(store: FakeCatalogStore, saleUnit: "UNIT" | "KG", now = clock) {
      return editProduct(
        { store, clock: now },
        {
          id: "product-1",
          name: "Yerba",
          categoryId: "category-1",
          brandId: null,
          saleUnit,
          barcodes: ["111"],
          tagIds: [],
          netContent: null,
          version: 1,
        },
      );
    }

    it("is refused naming a current buy-n-pay-m discount, leaving the product unchanged", async () => {
      const store = unitProductWithDiscount();
      const before = store.snapshot();

      const outcome = await edit(store, "KG");

      expect(outcome).toEqual({ kind: "sale_unit_held_by_discount", discountName: "3x2 Yerba" });
      expect(store.snapshot()).toEqual(before);
    });

    it("is refused by a scheduled buy-n-pay-m discount", async () => {
      const store = unitProductWithDiscount({ validFrom: "2026-07-01", validTo: "2026-07-31" });

      expect(await edit(store, "KG")).toEqual({
        kind: "sale_unit_held_by_discount",
        discountName: "3x2 Yerba",
      });
    });

    it("is refused on the last day of the discount, judged by Argentina's calendar day", async () => {
      const store = unitProductWithDiscount({ validFrom: "2026-06-01", validTo: "2026-06-15" });
      const lateInArgentina = { now: () => new Date("2026-06-16T01:00:00Z") };

      expect(await edit(store, "KG", lateInArgentina)).toEqual({
        kind: "sale_unit_held_by_discount",
        discountName: "3x2 Yerba",
      });
    });

    it("is allowed once the discount has ended", async () => {
      const store = unitProductWithDiscount({ validFrom: "2026-05-01", validTo: "2026-06-14" });

      expect(await edit(store, "KG")).toMatchObject({ kind: "applied" });
    });

    it("is allowed when the discount is switched off", async () => {
      const store = unitProductWithDiscount({ active: false });

      expect(await edit(store, "KG")).toMatchObject({ kind: "applied" });
    });

    it("is allowed when the discount is a percentage off", async () => {
      const store = unitProductWithDiscount({ kind: "PERCENT_OFF" });

      expect(await edit(store, "KG")).toMatchObject({ kind: "applied" });
    });

    it("is allowed when the discount targets another product", async () => {
      const store = unitProductWithDiscount({ productId: "decoy" });

      expect(await edit(store, "KG")).toMatchObject({ kind: "applied" });
    });

    it("names the first blocking discount by name when several block", async () => {
      const store = unitProductWithDiscount({ name: "Zeta" });
      store.seedDiscount({
        id: "discount-2",
        name: "Alfa",
        kind: "BUY_N_PAY_M",
        productId: "product-1",
        active: true,
        validFrom: "2026-06-01",
        validTo: "2026-06-30",
      });
      store.seedDiscount({
        id: "discount-3",
        name: "Beta",
        kind: "BUY_N_PAY_M",
        productId: "product-1",
        active: false,
        validFrom: "2026-06-01",
        validTo: "2026-06-30",
      });

      expect(await edit(store, "KG")).toEqual({
        kind: "sale_unit_held_by_discount",
        discountName: "Alfa",
      });
    });

    it("does not touch discounts when the product stays sold by the unit", async () => {
      const store = unitProductWithDiscount();

      expect(await edit(store, "UNIT")).toMatchObject({ kind: "applied" });
      expect(store.lockCallOrder).toEqual(["lockProduct", "lockLeafCategory"]);
    });

    it("does not touch discounts when the product goes from weight to unit", async () => {
      const store = new FakeCatalogStore();
      leafCategory(store);
      store.seedProduct(
        {
          id: "product-1",
          name: "Yerba",
          categoryId: "category-1",
          brandId: null,
          saleUnit: "KG",
          netContent: null,
          active: true,
          version: 1,
        },
        [{ code: "111" }],
      );

      expect(await edit(store, "UNIT")).toMatchObject({ kind: "applied" });
      expect(store.lockCallOrder).toEqual(["lockProduct", "lockLeafCategory"]);
    });

    it("does not touch discounts when the product stays sold by weight", async () => {
      const store = new FakeCatalogStore();
      leafCategory(store);
      store.seedProduct(
        {
          id: "product-1",
          name: "Yerba",
          categoryId: "category-1",
          brandId: null,
          saleUnit: "KG",
          netContent: null,
          active: true,
          version: 1,
        },
        [{ code: "111" }],
      );

      expect(await edit(store, "KG")).toMatchObject({ kind: "applied" });
      expect(store.lockCallOrder).toEqual(["lockProduct", "lockLeafCategory"]);
    });

    it("locks the product before reading the discounts", async () => {
      const store = unitProductWithDiscount({ active: false });

      await edit(store, "KG");

      expect(store.lockCallOrder).toEqual([
        "lockProduct",
        "buyNPayMDiscountsOn",
        "lockLeafCategory",
      ]);
    });

    it("answers stale_version before reading the discounts", async () => {
      const store = unitProductWithDiscount();

      const outcome = await editProduct(
        { store, clock },
        {
          id: "product-1",
          name: "Yerba",
          categoryId: "category-1",
          brandId: null,
          saleUnit: "KG",
          barcodes: ["111"],
          tagIds: [],
          netContent: null,
          version: 9,
        },
      );

      expect(outcome).toEqual({ kind: "stale_version" });
      expect(store.lockCallOrder).toEqual(["lockProduct"]);
    });
  });
});

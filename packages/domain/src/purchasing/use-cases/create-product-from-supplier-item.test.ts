import { describe, expect, it } from "vitest";
import { PRODUCT_NAME_MAX_LENGTH, type SaleUnit } from "../../catalog/index.js";
import {
  maySupplierPriceListRowBeLinked,
  SUPPLIER_PRICE_LIST_STATES,
  type SupplierPriceListState,
} from "../model/supplier-price-list.js";
import { createProductFromSupplierItem } from "./create-product-from-supplier-item.js";
import { FakeSupplierItemProductStore } from "./test-support/fake-supplier-item-product-store.js";

function setup(
  list: { state?: SupplierPriceListState; pricesIncludeVat?: boolean | null } = {},
  row: { description?: string; presentation?: string | null } = {},
) {
  const store = new FakeSupplierItemProductStore();
  store.lists.seedList({
    id: "list-1",
    state: list.state ?? "EXTRACTED",
    pricesIncludeVat: list.pricesIncludeVat === undefined ? false : list.pricesIncludeVat,
    version: 3,
  });
  store.lists.seedRow({
    id: "row-1",
    listId: "list-1",
    code: "Y-1",
    description: row.description ?? "Yerba 1 kg",
    presentation: row.presentation === undefined ? "Caja x 10" : row.presentation,
  });
  return store;
}

const input = {
  listId: "list-1",
  rowId: "row-1",
  version: 3,
  name: "Yerba mate 1 kg",
  saleUnit: "UNIT" as SaleUnit,
  categoryId: "category-1",
  brandId: null as string | null,
  barcodes: ["7790001000012"],
  tagIds: [] as string[],
  netContent: null as { quantity: number; unit: "KG" | "G" | "ML" | "L" | "UNIT" } | null,
  quantity: 10_000,
  vatRate: 2100 as number | null,
  actorId: "person-1",
};

describe("createProductFromSupplierItem", () => {
  it("creates the product with the name given and links the row to it with the quantity given", async () => {
    const store = setup();

    const outcome = await createProductFromSupplierItem(store, input);

    expect(outcome).toEqual({ kind: "created", productId: "product-new-1" });
    const state = store.snapshot();
    expect(state.products).toEqual([
      {
        id: "product-new-1",
        name: "Yerba mate 1 kg",
        categoryId: "category-1",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["7790001000012"],
        tagIds: [],
        netContent: null,
      },
    ]);
    expect(state.lists.rows[0]).toMatchObject({
      link: {
        productId: "product-new-1",
        quantity: 10_000,
        saleUnit: "UNIT",
        vatRate: 2100,
        relinkRequired: false,
      },
      reviewed: true,
      editedBy: "person-1",
    });
    expect(state.lists.lists[0]?.version).toBe(4);
  });

  it("creates the product with the brand, the tags and the net content given", async () => {
    const store = setup();

    await createProductFromSupplierItem(store, {
      ...input,
      brandId: "brand-1",
      tagIds: ["tag-1", "tag-2"],
      netContent: { quantity: 125, unit: "ML" },
    });

    expect(store.snapshot().products[0]).toMatchObject({
      brandId: "brand-1",
      tagIds: ["tag-1", "tag-2"],
      netContent: { quantity: 125, unit: "ML" },
    });
  });

  it("names the product as given even when the item's description is longer than a product's name may be", async () => {
    const store = setup({}, { description: "a".repeat(PRODUCT_NAME_MAX_LENGTH + 1) });

    const outcome = await createProductFromSupplierItem(store, input);

    expect(outcome.kind).toBe("created");
    expect(store.snapshot().products[0]?.name).toBe("Yerba mate 1 kg");
  });

  it("states the quantity in the sale unit the product was created with", async () => {
    const store = setup();

    await createProductFromSupplierItem(store, { ...input, saleUnit: "KG", quantity: 1_500 });

    expect(store.snapshot().lists.rows[0]?.link).toMatchObject({ saleUnit: "KG", quantity: 1_500 });
  });

  it("locks the list, then the row, before it writes anything", async () => {
    const store = setup();

    await createProductFromSupplierItem(store, input);

    expect(store.callOrder).toEqual(["lockList", "lockRow", "createCatalogProduct", "linkRow"]);
  });

  it("leaves the supplier's items alone while the list is under review", async () => {
    const store = setup();
    store.lists.seedSupplierItem({
      description: "Yerba 1 kg",
      key: { kind: "code", value: "Y-1" },
    });

    await createProductFromSupplierItem(store, input);

    expect(store.snapshot().lists.items[0]?.link).toBeNull();
    expect(store.callOrder).not.toContain("lockSupplierItems");
  });

  it("remembers the link for the supplier's item when the list is confirmed", async () => {
    const store = setup({ state: "REVIEWED" });
    store.lists.seedSupplierItem({
      description: "Yerba 1 kg",
      key: { kind: "code", value: "Y-1" },
    });
    store.lists.seedSupplierItem({ description: "Otro", key: { kind: "code", value: "Z-9" } });

    const outcome = await createProductFromSupplierItem(store, input);

    expect(outcome.kind).toBe("created");
    expect(store.snapshot().lists.items.map((item) => item.link)).toEqual([
      {
        productId: "product-new-1",
        quantity: 10_000,
        saleUnit: "UNIT",
        vatRate: 2100,
        relinkRequired: false,
      },
      null,
    ]);
    expect(store.callOrder.slice(-3)).toEqual([
      "linkRow",
      "lockSupplierItems",
      "rememberSupplierItemLink",
    ]);
  });

  it("creates for a confirmed list whose supplier has no remembered item", async () => {
    const store = setup({ state: "REVIEWED" });

    expect((await createProductFromSupplierItem(store, input)).kind).toBe("created");

    expect(store.snapshot().lists.items).toEqual([]);
  });

  it("keeps no rate for a list whose prices include VAT, and the rate the item remembers", async () => {
    const store = setup({ state: "REVIEWED", pricesIncludeVat: true });
    store.lists.seedSupplierItem({
      description: "Yerba 1 kg",
      key: { kind: "code", value: "Y-1" },
      link: {
        productId: "old",
        quantity: 1_000,
        saleUnit: "UNIT",
        vatRate: 1050,
        relinkRequired: false,
      },
    });

    await createProductFromSupplierItem(store, { ...input, vatRate: 2100 });

    const state = store.snapshot();
    expect(state.lists.rows[0]?.link?.vatRate).toBeNull();
    expect(state.lists.items[0]?.link).toEqual({
      productId: "product-new-1",
      quantity: 10_000,
      saleUnit: "UNIT",
      vatRate: 1050,
      relinkRequired: false,
    });
  });

  describe("refusals", () => {
    async function refusedWithNothingWritten(
      store: FakeSupplierItemProductStore,
      override: Partial<typeof input> = {},
    ) {
      const before = store.snapshot();
      const outcome = await createProductFromSupplierItem(store, { ...input, ...override });
      expect(store.snapshot()).toEqual(before);
      return outcome;
    }

    it("answers not_found for a missing list without locking a row", async () => {
      const store = setup();

      expect(await refusedWithNothingWritten(store, { listId: "missing" })).toEqual({
        kind: "not_found",
      });
      expect(store.callOrder).toEqual(["lockList"]);
    });

    it.each(SUPPLIER_PRICE_LIST_STATES.filter((state) => !maySupplierPriceListRowBeLinked(state)))(
      "answers not_editable for a list in state %s without locking a row",
      async (state) => {
        const store = setup({ state });

        expect(await refusedWithNothingWritten(store)).toEqual({ kind: "not_editable" });
        expect(store.callOrder).toEqual(["lockList"]);
      },
    );

    it("answers stale_version when the list moved on, without locking a row", async () => {
      const store = setup();

      expect(await refusedWithNothingWritten(store, { version: 2 })).toEqual({
        kind: "stale_version",
      });
      expect(store.callOrder).toEqual(["lockList"]);
    });

    it.each(["missing", "row-of-another-list"])(
      "answers not_found for the row %s",
      async (rowId) => {
        const store = setup();
        store.lists.seedList({ id: "list-2" });
        store.lists.seedRow({ id: "row-of-another-list", listId: "list-2" });

        expect(await refusedWithNothingWritten(store, { rowId })).toEqual({ kind: "not_found" });
        expect(store.callOrder).toEqual(["lockList", "lockRow"]);
      },
    );

    it("answers already_linked for a row that has a link", async () => {
      const store = setup();
      store.lists.seedRow({
        id: "row-2",
        listId: "list-1",
        link: {
          productId: "product-1",
          quantity: 1_000,
          saleUnit: "UNIT",
          vatRate: 2100,
          relinkRequired: false,
        },
      });

      expect(await refusedWithNothingWritten(store, { rowId: "row-2" })).toEqual({
        kind: "already_linked",
      });
      expect(store.callOrder).toEqual(["lockList", "lockRow"]);
    });

    it.each([
      ["UNIT", 1_500],
      ["UNIT", 0],
      ["KG", 0],
      ["KG", 1.5],
    ] as const)(
      "answers invalid_quantity for %s sold with a quantity of %s",
      async (saleUnit, quantity) => {
        const store = setup();

        expect(await refusedWithNothingWritten(store, { saleUnit, quantity })).toEqual({
          kind: "invalid_quantity",
        });
        expect(store.callOrder).toEqual(["lockList", "lockRow"]);
      },
    );

    it("answers vat_rate_invalid for a rate that is not offered", async () => {
      const store = setup();

      expect(await refusedWithNothingWritten(store, { vatRate: 21 })).toEqual({
        kind: "vat_rate_invalid",
      });
      expect(store.callOrder).toEqual(["lockList", "lockRow"]);
    });

    it("answers vat_rate_missing for a list whose prices exclude VAT when no rate is given", async () => {
      const store = setup({ pricesIncludeVat: false });

      expect(await refusedWithNothingWritten(store, { vatRate: null })).toEqual({
        kind: "vat_rate_missing",
      });
      expect(store.callOrder).toEqual(["lockList", "lockRow"]);
    });

    const catalogRefusals: NonNullable<FakeSupplierItemProductStore["catalogRefusal"]>[] = [
      { kind: "category_not_found" },
      { kind: "category_not_leaf" },
      { kind: "brand_not_found" },
      { kind: "brand_inactive" },
      { kind: "tag_not_found" },
      { kind: "tag_inactive", tagId: "tag-1" },
      { kind: "barcode_taken", codes: ["7790001000012"] },
    ];

    it.each(catalogRefusals)(
      "passes on the catalog's refusal $kind and writes nothing",
      async (refusal) => {
        const store = setup({ state: "REVIEWED" });
        store.lists.seedSupplierItem({
          description: "Yerba 1 kg",
          key: { kind: "code", value: "Y-1" },
        });
        store.catalogRefusal = refusal;

        expect(await refusedWithNothingWritten(store)).toEqual(refusal);
        expect(store.callOrder).toEqual(["lockList", "lockRow", "createCatalogProduct"]);
      },
    );
  });

  it("leaves nothing behind when the link cannot be written", async () => {
    const store = setup();
    store.failWrite("linkRow");
    const before = store.snapshot();

    await expect(createProductFromSupplierItem(store, input)).rejects.toThrow("linkRow failed");

    expect(store.snapshot()).toEqual(before);
    expect(store.callOrder).toEqual([]);
  });
});

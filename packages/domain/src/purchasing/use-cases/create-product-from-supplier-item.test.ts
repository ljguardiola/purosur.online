import { describe, expect, it } from "vitest";
import {
  maySupplierPriceListRowBeLinked,
  SUPPLIER_PRICE_LIST_STATES,
  type SupplierPriceListState,
} from "../model/supplier-price-list.js";
import { createProductFromSupplierItem } from "./create-product-from-supplier-item.js";
import { FakeSupplierItemProductStore } from "./test-support/fake-supplier-item-product-store.js";

function setup(list: { state?: SupplierPriceListState; pricesIncludeVat?: boolean | null } = {}) {
  const store = new FakeSupplierItemProductStore();
  store.lists.seedList({
    id: "list-1",
    state: list.state ?? "EXTRACTED",
    pricesIncludeVat: list.pricesIncludeVat === undefined ? false : list.pricesIncludeVat,
    version: 3,
  });
  store.lists.seedRow({ id: "row-1", listId: "list-1", code: "Y-1", description: "Yerba 1 kg" });
  return store;
}

const input = {
  listId: "list-1",
  rowId: "row-1",
  version: 3,
  name: "Yerba 1 kg",
  saleUnit: "UNIT" as const,
  categoryId: "category-1",
  barcodes: ["7790001000012"],
  packagingName: "Caja x 10",
  quantityPerPackage: 10_000,
  vatRate: 2100 as number | null,
  actorId: "person-1",
};

describe("createProductFromSupplierItem", () => {
  it("creates the product and its purchase presentation and links the row to them", async () => {
    const store = setup();

    const outcome = await createProductFromSupplierItem(store, input);

    expect(outcome).toEqual({
      kind: "created",
      productId: "product-new-1",
      packagingId: "packaging-new-1",
    });
    const state = store.snapshot();
    expect(state.products).toEqual([
      {
        id: "product-new-1",
        name: "Yerba 1 kg",
        categoryId: "category-1",
        saleUnit: "UNIT",
        barcodes: ["7790001000012"],
      },
    ]);
    expect(state.packagings).toEqual([
      {
        id: "packaging-new-1",
        productId: "product-new-1",
        name: "Caja x 10",
        quantityPerPackage: 10_000,
        saleUnit: "UNIT",
        actorId: "person-1",
      },
    ]);
    expect(state.lists.rows[0]).toMatchObject({
      link: { productId: "product-new-1", packagingId: "packaging-new-1", vatRate: 2100 },
      reviewed: true,
      editedBy: "person-1",
    });
    expect(state.lists.lists[0]?.version).toBe(4);
  });

  it("gives the presentation the sale unit the product was created with", async () => {
    const store = setup();

    await createProductFromSupplierItem(store, {
      ...input,
      saleUnit: "KG",
      quantityPerPackage: 1_500,
    });

    expect(store.snapshot().packagings[0]).toMatchObject({
      saleUnit: "KG",
      quantityPerPackage: 1_500,
    });
  });

  it("locks the list, then the row, before it writes anything", async () => {
    const store = setup();

    await createProductFromSupplierItem(store, input);

    expect(store.callOrder).toEqual([
      "lockList",
      "lockRow",
      "createCatalogProduct",
      "insertPackaging",
      "linkRow",
    ]);
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
      { productId: "product-new-1", packagingId: "packaging-new-1", vatRate: 2100 },
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
      link: { productId: "old", packagingId: "old", vatRate: 1050 },
    });

    await createProductFromSupplierItem(store, { ...input, vatRate: 2100 });

    const state = store.snapshot();
    expect(state.lists.rows[0]?.link?.vatRate).toBeNull();
    expect(state.lists.items[0]?.link).toEqual({
      productId: "product-new-1",
      packagingId: "packaging-new-1",
      vatRate: 1050,
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
        link: { productId: "product-1", packagingId: "packaging-1", vatRate: 2100 },
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
      "answers invalid_quantity for %s sold %s per package",
      async (saleUnit, quantityPerPackage) => {
        const store = setup();

        expect(await refusedWithNothingWritten(store, { saleUnit, quantityPerPackage })).toEqual({
          kind: "invalid_quantity",
        });
        expect(store.callOrder).toEqual(["lockList", "lockRow"]);
      },
    );

    it.each([21, 0, 1234])("answers vat_rate_invalid for the rate %s", async (vatRate) => {
      const store = setup();

      expect(await refusedWithNothingWritten(store, { vatRate })).toEqual({
        kind: "vat_rate_invalid",
      });
      expect(store.callOrder).toEqual(["lockList", "lockRow"]);
    });

    it("refuses an invalid rate even when the list's prices include VAT", async () => {
      const store = setup({ pricesIncludeVat: true });

      expect(await refusedWithNothingWritten(store, { vatRate: 21 })).toEqual({
        kind: "vat_rate_invalid",
      });
    });

    it.each([false, null])(
      "answers vat_rate_missing for a list whose prices include VAT: %j",
      async (pricesIncludeVat) => {
        const store = setup({ pricesIncludeVat });

        expect(await refusedWithNothingWritten(store, { vatRate: null })).toEqual({
          kind: "vat_rate_missing",
        });
        expect(store.callOrder).toEqual(["lockList", "lockRow"]);
      },
    );

    it("creates without a rate for a list whose prices include VAT", async () => {
      const store = setup({ pricesIncludeVat: true });

      expect((await createProductFromSupplierItem(store, { ...input, vatRate: null })).kind).toBe(
        "created",
      );
    });

    it.each([
      { kind: "category_not_found" },
      { kind: "category_not_leaf" },
      { kind: "barcode_taken", codes: ["7790001000012"] },
    ] as const)("passes on the catalog's refusal $kind and writes nothing", async (refusal) => {
      const store = setup({ state: "REVIEWED" });
      store.lists.seedSupplierItem({
        description: "Yerba 1 kg",
        key: { kind: "code", value: "Y-1" },
      });
      store.catalogRefusal = refusal;

      expect(await refusedWithNothingWritten(store)).toEqual(refusal);
      expect(store.callOrder).toEqual(["lockList", "lockRow", "createCatalogProduct"]);
    });
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

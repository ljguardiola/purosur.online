import { describe, expect, it } from "vitest";
import {
  maySupplierPriceListRowBeLinked,
  SUPPLIER_PRICE_LIST_STATES,
  type SupplierPriceListState,
} from "../model/supplier-price-list.js";
import { linkSupplierPriceListRow } from "./link-supplier-price-list-row.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";

function setup(list: { state?: SupplierPriceListState; pricesIncludeVat?: boolean | null } = {}) {
  const store = new FakeSupplierPriceListStore();
  store.seedList({
    id: "list-1",
    state: list.state ?? "EXTRACTED",
    pricesIncludeVat: list.pricesIncludeVat === undefined ? false : list.pricesIncludeVat,
    version: 3,
  });
  store.seedRow({ id: "row-1", listId: "list-1", code: "Y-1", description: "Yerba 1 kg" });
  store.seedProduct({ id: "product-1" });
  store.seedPackaging({ id: "packaging-1", productId: "product-1" });
  return store;
}

const input = {
  listId: "list-1",
  rowId: "row-1",
  version: 3,
  productId: "product-1",
  packagingId: "packaging-1",
  vatRate: 2100 as number | null,
  actorId: "person-1",
};

describe("linkSupplierPriceListRow", () => {
  it("links the row, marks it reviewed and advances the list's version", async () => {
    const store = setup();

    expect(await linkSupplierPriceListRow(store, input)).toEqual({ kind: "linked" });

    const state = store.snapshot();
    expect(state.rows[0]).toMatchObject({
      link: { productId: "product-1", packagingId: "packaging-1", vatRate: 2100 },
      reviewed: true,
      editedBy: "person-1",
    });
    expect(state.lists[0]?.version).toBe(4);
  });

  it("leaves the supplier's items alone while the list is under review", async () => {
    const store = setup();
    store.seedSupplierItem({ description: "Yerba 1 kg", key: { kind: "code", value: "Y-1" } });

    await linkSupplierPriceListRow(store, input);

    expect(store.snapshot().items[0]?.link).toBeNull();
    expect(store.lockCallOrder).not.toContain("lockSupplierItems");
  });

  it("links the row of a confirmed list and remembers the link for the supplier's item", async () => {
    const store = setup({ state: "REVIEWED" });
    store.seedSupplierItem({
      description: "Yerba 1 kg",
      key: { kind: "code", value: "Y-1" },
      link: { productId: "old", packagingId: "old", vatRate: null },
    });
    store.seedSupplierItem({ description: "Otro", key: { kind: "code", value: "Z-9" } });

    expect(await linkSupplierPriceListRow(store, input)).toEqual({ kind: "linked" });

    const state = store.snapshot();
    expect(state.rows[0]?.link).toEqual({
      productId: "product-1",
      packagingId: "packaging-1",
      vatRate: 2100,
    });
    expect(state.items.map((item) => item.link)).toEqual([
      { productId: "product-1", packagingId: "packaging-1", vatRate: 2100 },
      null,
    ]);
  });

  it("finds the item of a confirmed list's row without a code by its normalized description", async () => {
    const store = new FakeSupplierPriceListStore();
    store.seedList({ id: "list-1", state: "REVIEWED", pricesIncludeVat: true, version: 3 });
    store.seedRow({ id: "row-1", listId: "list-1", code: null, description: " YERBÁ  1 kg" });
    store.seedProduct({ id: "product-1" });
    store.seedPackaging({ id: "packaging-1", productId: "product-1" });
    store.seedSupplierItem({
      description: "Yerba 1 kg",
      key: { kind: "description", value: "yerba 1 kg" },
    });

    await linkSupplierPriceListRow(store, { ...input, vatRate: null });

    expect(store.snapshot().items[0]?.link).toEqual({
      productId: "product-1",
      packagingId: "packaging-1",
      vatRate: null,
    });
  });

  it("keeps the VAT rate the item remembers when linking a row of a confirmed list that includes VAT", async () => {
    const store = setup({ state: "REVIEWED", pricesIncludeVat: true });
    store.seedSupplierItem({
      description: "Yerba 1 kg",
      key: { kind: "code", value: "Y-1" },
      link: { productId: "old", packagingId: "old", vatRate: 1050 },
    });

    await linkSupplierPriceListRow(store, { ...input, vatRate: null });

    const state = store.snapshot();
    expect(state.rows[0]?.link?.vatRate).toBeNull();
    expect(state.items[0]?.link).toEqual({
      productId: "product-1",
      packagingId: "packaging-1",
      vatRate: 1050,
    });
  });

  it("does not touch another supplier's item with the same code", async () => {
    const store = setup({ state: "REVIEWED" });
    store.seedSupplierItem({
      supplierId: "supplier-b",
      description: "Yerba 1 kg",
      key: { kind: "code", value: "Y-1" },
    });

    await linkSupplierPriceListRow(store, input);

    expect(store.snapshot().items[0]?.link).toBeNull();
  });

  it("links the row of a confirmed list that has no remembered item", async () => {
    const store = setup({ state: "REVIEWED" });

    expect(await linkSupplierPriceListRow(store, input)).toEqual({ kind: "linked" });

    const state = store.snapshot();
    expect(state.items).toEqual([]);
    expect(state.rows[0]?.reviewed).toBe(true);
  });

  it("takes the locks in the order list, row, product and packaging, then the supplier's items", async () => {
    const store = setup({ state: "REVIEWED" });

    await linkSupplierPriceListRow(store, input);

    expect(store.lockCallOrder).toEqual([
      "lockList",
      "lockRow",
      "lockProductPackaging",
      "lockSupplierItems",
    ]);
  });

  it("answers not_found for a missing list without locking anything else", async () => {
    const store = setup();

    expect(await linkSupplierPriceListRow(store, { ...input, listId: "missing" })).toEqual({
      kind: "not_found",
    });
    expect(store.lockCallOrder).toEqual(["lockList"]);
  });

  it.each(SUPPLIER_PRICE_LIST_STATES.filter((state) => !maySupplierPriceListRowBeLinked(state)))(
    "refuses to link a row of a list that is %s",
    async (state) => {
      const store = setup({ state });
      const before = store.snapshot();

      expect(await linkSupplierPriceListRow(store, { ...input, version: 99 })).toEqual({
        kind: "not_editable",
      });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("refuses a version other than the one loaded", async () => {
    const store = setup();
    const before = store.snapshot();

    expect(await linkSupplierPriceListRow(store, { ...input, version: 2 })).toEqual({
      kind: "stale_version",
    });
    expect(store.snapshot()).toEqual(before);
  });

  it("checks the version before looking for the row", async () => {
    const store = setup();

    expect(
      await linkSupplierPriceListRow(store, { ...input, version: 2, rowId: "missing" }),
    ).toEqual({ kind: "stale_version" });
  });

  it("answers not_found for a row of another list", async () => {
    const store = setup();
    store.seedList({ id: "list-2", state: "EXTRACTED" });
    store.seedRow({ id: "row-2", listId: "list-2" });
    const before = store.snapshot();

    expect(await linkSupplierPriceListRow(store, { ...input, rowId: "row-2" })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot()).toEqual(before);
  });

  describe("the product and its packaging", () => {
    it.each([
      ["a product that does not exist", { productId: "missing" }],
      ["a packaging that does not exist", { packagingId: "missing" }],
    ])("refuses %s", async (_name, changes) => {
      const store = setup();
      const before = store.snapshot();

      expect(await linkSupplierPriceListRow(store, { ...input, ...changes })).toEqual({
        kind: "packaging_not_linkable",
      });
      expect(store.snapshot()).toEqual(before);
    });

    it("refuses a packaging of another product", async () => {
      const store = setup();
      store.seedProduct({ id: "product-2" });

      expect(await linkSupplierPriceListRow(store, { ...input, productId: "product-2" })).toEqual({
        kind: "packaging_not_linkable",
      });
    });

    it("refuses a deactivated product", async () => {
      const store = setup();
      store.seedProduct({ id: "product-2", active: false });
      store.seedPackaging({ id: "packaging-2", productId: "product-2" });

      expect(
        await linkSupplierPriceListRow(store, {
          ...input,
          productId: "product-2",
          packagingId: "packaging-2",
        }),
      ).toEqual({ kind: "packaging_not_linkable" });
    });

    it("refuses a deactivated packaging", async () => {
      const store = setup();
      store.seedPackaging({ id: "packaging-2", productId: "product-1", active: false });

      expect(
        await linkSupplierPriceListRow(store, { ...input, packagingId: "packaging-2" }),
      ).toEqual({ kind: "packaging_not_linkable" });
    });

    it("refuses a packaging whose sale unit is no longer the product's", async () => {
      const store = setup();
      store.seedProduct({ id: "product-2", saleUnit: "KG" });
      store.seedPackaging({ id: "packaging-2", productId: "product-2", saleUnit: "UNIT" });

      expect(
        await linkSupplierPriceListRow(store, {
          ...input,
          productId: "product-2",
          packagingId: "packaging-2",
        }),
      ).toEqual({ kind: "packaging_not_linkable" });
    });

    it("accepts a packaging sold by the kilo of a product sold by the kilo", async () => {
      const store = setup();
      store.seedProduct({ id: "product-2", saleUnit: "KG" });
      store.seedPackaging({ id: "packaging-2", productId: "product-2", saleUnit: "KG" });

      expect(
        await linkSupplierPriceListRow(store, {
          ...input,
          productId: "product-2",
          packagingId: "packaging-2",
        }),
      ).toEqual({ kind: "linked" });
    });

    it("reports the packaging before the missing rate", async () => {
      const store = setup();

      expect(
        await linkSupplierPriceListRow(store, {
          ...input,
          packagingId: "missing",
          vatRate: null,
        }),
      ).toEqual({ kind: "packaging_not_linkable" });
    });
  });

  describe("the VAT rate", () => {
    it.each([false, null])(
      "is required when the list's prices are %j for VAT included",
      async (pricesIncludeVat) => {
        const store = setup({ pricesIncludeVat });
        const before = store.snapshot();

        expect(await linkSupplierPriceListRow(store, { ...input, vatRate: null })).toEqual({
          kind: "vat_rate_missing",
        });
        expect(store.snapshot()).toEqual(before);
      },
    );

    it.each([1050, 2100])("is remembered with the link when it is %s", async (vatRate) => {
      const store = setup();

      await linkSupplierPriceListRow(store, { ...input, vatRate });

      expect(store.snapshot().rows[0]?.link?.vatRate).toBe(vatRate);
    });

    it.each([0, 21, 1234, -2100, Number.NaN])("is refused when it is %s", async (vatRate) => {
      const store = setup();
      const before = store.snapshot();

      expect(await linkSupplierPriceListRow(store, { ...input, vatRate })).toEqual({
        kind: "vat_rate_invalid",
      });
      expect(store.snapshot()).toEqual(before);
    });

    it("is refused when invalid even though the list's prices include VAT", async () => {
      const store = setup({ pricesIncludeVat: true });

      expect(await linkSupplierPriceListRow(store, { ...input, vatRate: 1234 })).toEqual({
        kind: "vat_rate_invalid",
      });
    });

    it.each([null, 1050])(
      "is not kept when the list's prices include VAT (given %j)",
      async (vatRate) => {
        const store = setup({ pricesIncludeVat: true });

        expect(await linkSupplierPriceListRow(store, { ...input, vatRate })).toEqual({
          kind: "linked",
        });
        expect(store.snapshot().rows[0]?.link?.vatRate).toBeNull();
      },
    );
  });

  it("leaves nothing behind when remembering the link for the item fails", async () => {
    const store = setup({ state: "REVIEWED" });
    store.seedSupplierItem({ description: "Yerba 1 kg", key: { kind: "code", value: "Y-1" } });
    store.failingWrites.add("rememberSupplierItemLink");
    const before = store.snapshot();

    await expect(linkSupplierPriceListRow(store, input)).rejects.toThrow(
      "rememberSupplierItemLink failed",
    );
    expect(store.snapshot()).toEqual(before);
  });
});

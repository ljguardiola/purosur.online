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
  return store;
}

const input = {
  listId: "list-1",
  rowId: "row-1",
  version: 3,
  productId: "product-1",
  quantity: 12_000,
  vatRate: 2100 as number | null,
  actorId: "person-1",
};

describe("linkSupplierPriceListRow", () => {
  it("links the row, marks it reviewed and advances the list's version", async () => {
    const store = setup();

    expect(await linkSupplierPriceListRow(store, input)).toEqual({ kind: "linked" });

    const state = store.snapshot();
    expect(state.rows[0]).toMatchObject({
      link: {
        productId: "product-1",
        quantity: 12_000,
        saleUnit: "UNIT",
        vatRate: 2100,
        relinkRequired: false,
      },
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
      link: { productId: "old", quantity: 1_000, saleUnit: "UNIT", vatRate: null, relinkRequired: false },
    });
    store.seedSupplierItem({ description: "Otro", key: { kind: "code", value: "Z-9" } });

    expect(await linkSupplierPriceListRow(store, input)).toEqual({ kind: "linked" });

    const state = store.snapshot();
    expect(state.rows[0]?.link).toEqual({
      productId: "product-1",
      quantity: 12_000,
      saleUnit: "UNIT",
      vatRate: 2100,
      relinkRequired: false,
    });
    expect(state.items.map((item) => item.link)).toEqual([
      {
        productId: "product-1",
        quantity: 12_000,
        saleUnit: "UNIT",
        vatRate: 2100,
        relinkRequired: false,
      },
      null,
    ]);
  });

  it("finds the item of a confirmed list's row without a code by its normalized description", async () => {
    const store = new FakeSupplierPriceListStore();
    store.seedList({ id: "list-1", state: "REVIEWED", pricesIncludeVat: true, version: 3 });
    store.seedRow({ id: "row-1", listId: "list-1", code: null, description: " YERBÁ  1 kg" });
    store.seedProduct({ id: "product-1" });
      store.seedSupplierItem({
      description: "Yerba 1 kg",
      key: { kind: "description", value: "yerba 1 kg" },
    });

    await linkSupplierPriceListRow(store, { ...input, vatRate: null });

    expect(store.snapshot().items[0]?.link).toEqual({
      productId: "product-1",
      quantity: 12_000,
      saleUnit: "UNIT",
      vatRate: null,
      relinkRequired: false,
    });
  });

  it("keeps the VAT rate the item remembers when linking a row of a confirmed list that includes VAT", async () => {
    const store = setup({ state: "REVIEWED", pricesIncludeVat: true });
    store.seedSupplierItem({
      description: "Yerba 1 kg",
      key: { kind: "code", value: "Y-1" },
      link: { productId: "old", quantity: 1_000, saleUnit: "UNIT", vatRate: 1050, relinkRequired: false },
    });

    await linkSupplierPriceListRow(store, { ...input, vatRate: null });

    const state = store.snapshot();
    expect(state.rows[0]?.link?.vatRate).toBeNull();
    expect(state.items[0]?.link).toEqual({
      productId: "product-1",
      quantity: 12_000,
      saleUnit: "UNIT",
      vatRate: 1050,
      relinkRequired: false,
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

  it("takes the locks in the order list, row, product, then the supplier's items", async () => {
    const store = setup({ state: "REVIEWED" });

    await linkSupplierPriceListRow(store, input);

    expect(store.lockCallOrder).toEqual([
      "lockList",
      "lockRow",
      "lockLinkableProduct",
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

  describe("the product", () => {
    it("refuses a product that does not exist", async () => {
      const store = setup();
      const before = store.snapshot();

      expect(await linkSupplierPriceListRow(store, { ...input, productId: "missing" })).toEqual({
        kind: "product_not_linkable",
      });
      expect(store.snapshot()).toEqual(before);
    });

    it("refuses a deactivated product", async () => {
      const store = setup();
      store.seedProduct({ id: "product-2", active: false });
      const before = store.snapshot();

      expect(await linkSupplierPriceListRow(store, { ...input, productId: "product-2" })).toEqual({
        kind: "product_not_linkable",
      });
      expect(store.snapshot()).toEqual(before);
    });

    it("states the quantity in the sale unit the product is sold by", async () => {
      const store = setup();
      store.seedProduct({ id: "product-2", saleUnit: "KG" });

      expect(
        await linkSupplierPriceListRow(store, { ...input, productId: "product-2", quantity: 500 }),
      ).toEqual({ kind: "linked" });
      expect(store.snapshot().rows[0]?.link).toMatchObject({
        productId: "product-2",
        quantity: 500,
        saleUnit: "KG",
      });
    });

    it("reports the product before the quantity and the missing rate", async () => {
      const store = setup();

      expect(
        await linkSupplierPriceListRow(store, {
          ...input,
          productId: "missing",
          quantity: 0,
          vatRate: null,
        }),
      ).toEqual({ kind: "product_not_linkable" });
    });
  });

  describe("the quantity", () => {
    it.each([
      ["UNIT", 1_500],
      ["UNIT", 0],
      ["UNIT", -1_000],
      ["KG", 0],
      ["KG", 1.5],
    ] as const)("refuses %s sold with a quantity of %s and writes nothing", async (saleUnit, quantity) => {
      const store = setup();
      store.seedProduct({ id: "product-2", saleUnit });
      const before = store.snapshot();

      expect(
        await linkSupplierPriceListRow(store, { ...input, productId: "product-2", quantity }),
      ).toEqual({ kind: "invalid_quantity" });
      expect(store.snapshot()).toEqual(before);
    });

    it("reports the quantity before the missing rate", async () => {
      const store = setup();

      expect(await linkSupplierPriceListRow(store, { ...input, quantity: 0, vatRate: null })).toEqual({
        kind: "invalid_quantity",
      });
    });
  });

  describe("the VAT rate", () => {
    it("refuses a missing rate and writes nothing", async () => {
      const store = setup();
      const before = store.snapshot();

      expect(await linkSupplierPriceListRow(store, { ...input, vatRate: null })).toEqual({
        kind: "vat_rate_missing",
      });
      expect(store.snapshot()).toEqual(before);
    });

    it("refuses a rate that is not offered and writes nothing", async () => {
      const store = setup();
      const before = store.snapshot();

      expect(await linkSupplierPriceListRow(store, { ...input, vatRate: 1234 })).toEqual({
        kind: "vat_rate_invalid",
      });
      expect(store.snapshot()).toEqual(before);
    });

    it("stores no rate with the link when the list's prices include VAT", async () => {
      const store = setup({ pricesIncludeVat: true });

      expect(await linkSupplierPriceListRow(store, { ...input, vatRate: 1050 })).toEqual({
        kind: "linked",
      });
      expect(store.snapshot().rows[0]?.link?.vatRate).toBeNull();
    });
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

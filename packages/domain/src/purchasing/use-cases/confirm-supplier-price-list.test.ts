import { describe, expect, it } from "vitest";
import { SUPPLIER_PRICE_LIST_STATES } from "../model/supplier-price-list.js";
import { confirmSupplierPriceList } from "./confirm-supplier-price-list.js";
import type { SupplierItemLink } from "./supplier-price-list-store.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";

const NOW = new Date("2026-03-12T15:00:00Z");

function setup(
  list: {
    state?: (typeof SUPPLIER_PRICE_LIST_STATES)[number];
    listDate?: string | null;
    pricesIncludeVat?: boolean | null;
  } = {},
  prices: (number | null)[] = [100_050, 250],
) {
  const store = new FakeSupplierPriceListStore();
  store.seedList({
    id: "list-1",
    state: list.state ?? "EXTRACTED",
    listDate: list.listDate === undefined ? "2026-03-01" : list.listDate,
    pricesIncludeVat: list.pricesIncludeVat === undefined ? true : list.pricesIncludeVat,
    version: 3,
  });
  prices.forEach((priceCents, index) => {
    store.seedRow({ id: `row-${index}`, listId: "list-1", priceCents });
  });
  return store;
}

const input = {
  listId: "list-1",
  version: 3,
  listDate: null,
  pricesIncludeVat: null,
  actorId: "person-1",
  now: NOW,
};

describe("confirmSupplierPriceList", () => {
  it("confirms the list with the date it was read with, storing prices untouched", async () => {
    const store = setup();

    expect(await confirmSupplierPriceList(store, input)).toEqual({ kind: "confirmed" });

    const state = store.snapshot();
    expect(state.lists[0]).toMatchObject({
      state: "REVIEWED",
      listDate: "2026-03-01",
      confirmedAt: NOW,
      confirmedBy: "person-1",
      version: 4,
    });
    expect(state.rows.map((row) => row.priceCents)).toEqual([100_050, 250]);
  });

  it("takes the date typed in the review over the one read", async () => {
    const store = setup();

    await confirmSupplierPriceList(store, { ...input, listDate: "2026-02-20" });

    expect(store.snapshot().lists[0]?.listDate).toBe("2026-02-20");
  });

  it("takes the typed date when the reading found none", async () => {
    const store = setup({ listDate: null });

    expect(await confirmSupplierPriceList(store, { ...input, listDate: "2026-02-20" })).toEqual({
      kind: "confirmed",
    });
    expect(store.snapshot().lists[0]?.listDate).toBe("2026-02-20");
  });

  it("refuses a list with no date at all", async () => {
    const store = setup({ listDate: null });

    expect(await confirmSupplierPriceList(store, input)).toEqual({ kind: "list_date_missing" });
    expect(store.snapshot().lists[0]?.state).toBe("EXTRACTED");
  });

  it("confirms the list with the VAT answer it was read with", async () => {
    const store = setup({ pricesIncludeVat: false });

    expect(await confirmSupplierPriceList(store, input)).toEqual({ kind: "confirmed" });

    expect(store.snapshot().lists[0]?.pricesIncludeVat).toBe(false);
  });

  it("takes the VAT answer chosen in the review over the one read", async () => {
    const store = setup({ pricesIncludeVat: true });

    await confirmSupplierPriceList(store, { ...input, pricesIncludeVat: false });

    expect(store.snapshot().lists[0]?.pricesIncludeVat).toBe(false);
  });

  it("takes the VAT answer chosen in the review when the reading found none", async () => {
    const store = setup({ pricesIncludeVat: null });

    expect(await confirmSupplierPriceList(store, { ...input, pricesIncludeVat: true })).toEqual({
      kind: "confirmed",
    });
    expect(store.snapshot().lists[0]?.pricesIncludeVat).toBe(true);
  });

  it("refuses a list whose VAT answer is not set, read or chosen", async () => {
    const store = setup({ pricesIncludeVat: null });

    expect(await confirmSupplierPriceList(store, input)).toEqual({ kind: "vat_missing" });
    expect(store.snapshot().lists[0]?.state).toBe("EXTRACTED");
  });

  it.each([true, false])(
    "stores every price as printed whether prices include VAT (%s)",
    async (vat) => {
      const store = setup({ pricesIncludeVat: vat });

      await confirmSupplierPriceList(store, input);

      expect(store.snapshot().rows.map((row) => row.priceCents)).toEqual([100_050, 250]);
    },
  );

  it("refuses a list left with no rows", async () => {
    const store = setup({}, []);

    expect(await confirmSupplierPriceList(store, input)).toEqual({ kind: "no_rows" });
    expect(store.snapshot().lists[0]?.state).toBe("EXTRACTED");
  });

  it("refuses a list with a row still without price", async () => {
    const store = setup({}, [100, null]);

    expect(await confirmSupplierPriceList(store, input)).toEqual({ kind: "unpriced_rows" });
    expect(store.snapshot().lists[0]?.state).toBe("EXTRACTED");
  });

  it("answers not_found for a missing list", async () => {
    expect(await confirmSupplierPriceList(setup(), { ...input, listId: "missing" })).toEqual({
      kind: "not_found",
    });
  });

  it.each(SUPPLIER_PRICE_LIST_STATES.filter((state) => state !== "EXTRACTED"))(
    "refuses a list that is %s",
    async (state) => {
      const store = setup({ state });

      expect(await confirmSupplierPriceList(store, input)).toEqual({ kind: "not_editable" });
      expect(store.snapshot().lists[0]?.state).toBe(state);
    },
  );

  it("refuses a stale version before judging the rows", async () => {
    const store = setup({}, []);

    expect(await confirmSupplierPriceList(store, { ...input, version: 2 })).toEqual({
      kind: "stale_version",
    });
  });
});

describe("confirmSupplierPriceList and the supplier's items", () => {
  const LINK: SupplierItemLink = {
    productId: "product-1",
    packagingId: "packaging-1",
    vatRate: 2100,
  };

  type SeededRow = {
    code?: string | null;
    description: string;
    priceCents: number | null;
    link?: SupplierItemLink | null;
    reviewed?: boolean;
  };

  function setupRows(rows: SeededRow[]) {
    const store = new FakeSupplierPriceListStore();
    store.seedList({
      id: "list-1",
      state: "EXTRACTED",
      listDate: "2026-03-01",
      pricesIncludeVat: true,
      version: 3,
    });
    rows.forEach((row, index) => {
      store.seedRow({ id: `row-${index}`, listId: "list-1", ...row });
    });
    return store;
  }

  it("remembers a new item with the description of its row and records its price for the list", async () => {
    const store = setupRows([{ code: "Y-1", description: "Yerba 1 kg", priceCents: 150_050 }]);

    await confirmSupplierPriceList(store, input);

    const state = store.snapshot();
    expect(state.items).toEqual([
      {
        id: expect.any(String),
        supplierId: "supplier-a",
        key: { kind: "code", value: "Y-1" },
        description: "Yerba 1 kg",
        link: null,
      },
    ]);
    expect(state.itemPrices).toEqual([
      {
        itemId: state.items[0]?.id,
        listId: "list-1",
        priceCents: 150_050,
        listDate: "2026-03-01",
        pricesIncludeVat: true,
      },
    ]);
  });

  it("identifies an item without a code by its normalized description", async () => {
    const store = setupRows([{ description: "  YERBÁ   mate", priceCents: 100 }]);

    await confirmSupplierPriceList(store, input);

    expect(store.snapshot().items[0]?.key).toEqual({ kind: "description", value: "yerba mate" });
  });

  it("updates the description of an item already remembered and appends a price to its history", async () => {
    const store = setupRows([{ code: "Y-1", description: "Yerba 1 kg nueva", priceCents: 200 }]);
    const itemId = store.seedSupplierItem({
      description: "Yerba 1 kg",
      key: { kind: "code", value: "Y-1" },
    });

    await confirmSupplierPriceList(store, input);

    const state = store.snapshot();
    expect(state.items).toHaveLength(1);
    expect(state.items[0]?.description).toBe("Yerba 1 kg nueva");
    expect(state.itemPrices).toEqual([expect.objectContaining({ itemId, priceCents: 200 })]);
  });

  describe("a list dated before the item's latest price", () => {
    function setupOlder() {
      const store = setupRows([
        { code: "Y-1", description: "Yerba vieja", priceCents: 100, link: LINK, reviewed: true },
      ]);
      const itemId = store.seedSupplierItem({
        description: "Yerba nueva",
        key: { kind: "code", value: "Y-1" },
      });
      store.seedSupplierItemPrice({
        itemId,
        listId: "list-newer",
        priceCents: 500,
        listDate: "2026-04-01",
        pricesIncludeVat: true,
      });
      return store;
    }

    it("keeps the item's current description, still recording the price in its history", async () => {
      const store = setupOlder();

      await confirmSupplierPriceList(store, input);

      const state = store.snapshot();
      expect(state.items[0]?.description).toBe("Yerba nueva");
      expect(state.itemPrices.map((entry) => entry.listId)).toEqual(["list-newer", "list-1"]);
    });

    it("still remembers the link a person made", async () => {
      const store = setupOlder();

      await confirmSupplierPriceList(store, input);

      expect(store.snapshot().items[0]?.link).toEqual(LINK);
    });

    it.each(["2026-03-01", "2026-02-01"])(
      "takes the description once the list is dated on or after the latest price (%s vs 2026-03-01)",
      async (latest) => {
        const store = setupRows([{ code: "Y-1", description: "Yerba vieja", priceCents: 100 }]);
        const itemId = store.seedSupplierItem({
          description: "Yerba nueva",
          key: { kind: "code", value: "Y-1" },
        });
        store.seedSupplierItemPrice({
          itemId,
          listId: "list-before",
          priceCents: 500,
          listDate: latest,
          pricesIncludeVat: true,
        });

        await confirmSupplierPriceList(store, input);

        expect(store.snapshot().items[0]?.description).toBe("Yerba vieja");
      },
    );
  });

  it("copies the link of a linked row to its item, replacing the one it had", async () => {
    const store = setupRows([
      { code: "Y-1", description: "Yerba", priceCents: 100, link: LINK, reviewed: true },
      { code: "Z-1", description: "Azúcar", priceCents: 100, link: LINK, reviewed: true },
    ]);
    store.seedSupplierItem({
      description: "Yerba",
      key: { kind: "code", value: "Y-1" },
      link: { productId: "old", packagingId: "old", vatRate: null },
    });

    await confirmSupplierPriceList(store, input);

    expect(store.snapshot().items.map((item) => item.link)).toEqual([LINK, LINK]);
  });

  it("leaves the item's link alone when the row only carries the link copied when the list was read", async () => {
    const relinked = { productId: "product-2", packagingId: "packaging-2", vatRate: 1050 };
    const store = setupRows([
      { code: "Y-1", description: "Yerba", priceCents: 100, link: LINK, reviewed: false },
    ]);
    store.seedSupplierItem({
      description: "Yerba",
      key: { kind: "code", value: "Y-1" },
      link: relinked,
    });

    await confirmSupplierPriceList(store, input);

    expect(store.snapshot().items[0]?.link).toEqual(relinked);
  });

  it("takes the link of the last row a person linked over a later row's copied link", async () => {
    const copied = { productId: "product-2", packagingId: "packaging-2", vatRate: 1050 };
    const store = setupRows([
      { code: "Y-1", description: "A", priceCents: 100, link: LINK, reviewed: true },
      { code: "Y-1", description: "B", priceCents: 200, link: copied, reviewed: false },
    ]);

    await confirmSupplierPriceList(store, input);

    expect(store.snapshot().items[0]?.link).toEqual(LINK);
  });

  it("keeps the VAT rate the item remembers when the row was linked in a list that includes VAT", async () => {
    const store = setupRows([
      {
        code: "Y-1",
        description: "Yerba",
        priceCents: 100,
        link: { productId: "product-2", packagingId: "packaging-2", vatRate: null },
        reviewed: true,
      },
    ]);
    store.seedSupplierItem({
      description: "Yerba",
      key: { kind: "code", value: "Y-1" },
      link: { productId: "product-1", packagingId: "packaging-1", vatRate: 1050 },
    });

    await confirmSupplierPriceList(store, input);

    expect(store.snapshot().items[0]?.link).toEqual({
      productId: "product-2",
      packagingId: "packaging-2",
      vatRate: 1050,
    });
  });

  it("never erases the link an item already has when its row has none", async () => {
    const store = setupRows([{ code: "Y-1", description: "Yerba", priceCents: 100, link: null }]);
    store.seedSupplierItem({
      description: "Yerba",
      key: { kind: "code", value: "Y-1" },
      link: LINK,
    });

    await confirmSupplierPriceList(store, input);

    expect(store.snapshot().items[0]?.link).toEqual(LINK);
  });

  it("confirms a list with rows not linked to any product", async () => {
    const store = setupRows([{ code: "Y-1", description: "Yerba", priceCents: 100 }]);

    expect(await confirmSupplierPriceList(store, input)).toEqual({ kind: "confirmed" });
    expect(store.snapshot().lists[0]?.state).toBe("REVIEWED");
  });

  describe("rows printing the same item", () => {
    it("records the item once, with the price and description of the last row by position", async () => {
      const store = setupRows([
        { code: "Y-1", description: "Yerba primera", priceCents: 100 },
        { code: "Z-1", description: "Azúcar", priceCents: 300 },
        { code: "Y-1", description: "Yerba última", priceCents: 200 },
      ]);

      await confirmSupplierPriceList(store, input);

      const state = store.snapshot();
      expect(state.items.map((item) => [item.key.value, item.description])).toEqual([
        ["Y-1", "Yerba última"],
        ["Z-1", "Azúcar"],
      ]);
      expect(state.itemPrices.map((entry) => entry.priceCents)).toEqual([200, 300]);
    });

    it("takes the description key of rows that differ only in case, accents and spacing", async () => {
      const store = setupRows([
        { description: "Azúcar 1 kg", priceCents: 100 },
        { description: "azucar  1 KG", priceCents: 150 },
      ]);

      await confirmSupplierPriceList(store, input);

      const state = store.snapshot();
      expect(state.items).toHaveLength(1);
      expect(state.itemPrices.map((entry) => entry.priceCents)).toEqual([150]);
    });

    it("keeps the link of the last linked row when the last row, though reviewed, has none", async () => {
      const store = setupRows([
        { code: "Y-1", description: "A", priceCents: 100, link: LINK, reviewed: true },
        { code: "Y-1", description: "B", priceCents: 200, link: null, reviewed: true },
      ]);

      await confirmSupplierPriceList(store, input);

      expect(store.snapshot().items[0]?.link).toEqual(LINK);
    });

    it("takes the link of the last row when several are linked", async () => {
      const other = { productId: "product-2", packagingId: "packaging-2", vatRate: null };
      const store = setupRows([
        { code: "Y-1", description: "A", priceCents: 100, link: LINK, reviewed: true },
        { code: "Y-1", description: "B", priceCents: 200, link: other, reviewed: true },
      ]);

      await confirmSupplierPriceList(store, input);

      expect(store.snapshot().items[0]?.link).toEqual(other);
    });
  });

  it("leaves untouched the items the list does not print", async () => {
    const store = setupRows([{ code: "Y-1", description: "Yerba", priceCents: 100 }]);
    store.seedSupplierItem({
      id: "absent",
      description: "Fideos",
      key: { kind: "code", value: "F-1" },
      link: LINK,
    });
    const before = store.snapshot().items[0];

    await confirmSupplierPriceList(store, input);

    const state = store.snapshot();
    expect(state.items.find((item) => item.id === "absent")).toEqual(before);
    expect(state.itemPrices.map((entry) => entry.itemId)).not.toContain("absent");
  });

  it("does not touch another supplier's item with the same code", async () => {
    const store = setupRows([{ code: "Y-1", description: "Yerba", priceCents: 100 }]);
    store.seedSupplierItem({
      id: "other-supplier",
      supplierId: "supplier-b",
      description: "Otra",
      key: { kind: "code", value: "Y-1" },
    });

    await confirmSupplierPriceList(store, input);

    const state = store.snapshot();
    expect(state.items.find((item) => item.id === "other-supplier")?.description).toBe("Otra");
    expect(state.items).toHaveLength(2);
  });

  it("records the date and VAT answer the list is confirmed with", async () => {
    const store = setupRows([{ code: "Y-1", description: "Yerba", priceCents: 100 }]);

    await confirmSupplierPriceList(store, {
      ...input,
      listDate: "2026-02-20",
      pricesIncludeVat: false,
    });

    expect(store.snapshot().itemPrices[0]).toMatchObject({
      listDate: "2026-02-20",
      pricesIncludeVat: false,
    });
  });

  it("takes the locks of the list and then of the supplier's items", async () => {
    const store = setupRows([{ code: "Y-1", description: "Yerba", priceCents: 100 }]);

    await confirmSupplierPriceList(store, input);

    expect(store.lockCallOrder).toEqual(["lockList", "lockSupplierItems"]);
  });

  it.each([
    ["a list with an unpriced row", [{ code: "Y-1", description: "A", priceCents: null }]],
    ["a list without rows", []],
  ])("remembers nothing of %s", async (_name, rows) => {
    const store = setupRows(rows);

    await confirmSupplierPriceList(store, input);

    const state = store.snapshot();
    expect(state.items).toEqual([]);
    expect(state.itemPrices).toEqual([]);
    expect(store.lockCallOrder).toEqual(["lockList"]);
  });

  it.each([
    "addSupplierItem",
    "describeSupplierItem",
    "rememberSupplierItemLink",
    "recordSupplierItemPrice",
    "confirmList",
  ] as const)("leaves the list unconfirmed and nothing remembered when %s fails", async (write) => {
    const store = setupRows([
      { code: "Y-1", description: "Yerba", priceCents: 100, link: LINK, reviewed: true },
      { code: "Z-1", description: "Azúcar", priceCents: 100, link: LINK, reviewed: true },
    ]);
    store.seedSupplierItem({ description: "Yerba", key: { kind: "code", value: "Y-1" } });
    store.failingWrites.add(write);
    const before = store.snapshot();

    await expect(confirmSupplierPriceList(store, input)).rejects.toThrow(`${write} failed`);
    expect(store.snapshot()).toEqual(before);
  });
});

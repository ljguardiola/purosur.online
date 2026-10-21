import { describe, expect, it } from "vitest";
import { SUPPLIER_PRICE_LIST_STATES } from "../model/supplier-price-list.js";
import { setSupplierPriceListRowPrice } from "./set-supplier-price-list-row-price.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";

function setup(state: (typeof SUPPLIER_PRICE_LIST_STATES)[number] = "EXTRACTED") {
  const store = new FakeSupplierPriceListStore();
  store.seedList({ id: "list-1", state, version: 3 });
  store.seedList({ id: "list-2", state: "EXTRACTED", version: 7 });
  store.seedRow({ id: "row-1", listId: "list-1", priceCents: null });
  store.seedRow({ id: "row-2", listId: "list-1", priceCents: 500 });
  store.seedRow({ id: "row-3", listId: "list-2", priceCents: null });
  return store;
}

const input = {
  listId: "list-1",
  rowId: "row-1",
  priceCents: 123_450,
  version: 3,
  actorId: "person-1",
};

describe("setSupplierPriceListRowPrice", () => {
  it("types the price of one row, keeps the others and advances the version", async () => {
    const store = setup();

    expect(await setSupplierPriceListRowPrice(store, input)).toEqual({ kind: "updated" });

    const state = store.snapshot();
    expect(state.rows.map((row) => [row.id, row.priceCents, row.editedBy])).toEqual([
      ["row-1", 123_450, "person-1"],
      ["row-2", 500, null],
      ["row-3", null, null],
    ]);
    expect(state.lists.map((list) => [list.id, list.version])).toEqual([
      ["list-1", 4],
      ["list-2", 7],
    ]);
    expect(store.lockCallOrder).toEqual(["lockList", "lockRow"]);
  });

  it("answers not_found for a missing list", async () => {
    expect(await setSupplierPriceListRowPrice(setup(), { ...input, listId: "missing" })).toEqual({
      kind: "not_found",
    });
  });

  it("answers not_found for a row of another list, changing nothing", async () => {
    const store = setup();

    expect(await setSupplierPriceListRowPrice(store, { ...input, rowId: "row-3" })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot().rows[2]?.priceCents).toBeNull();
    expect(store.snapshot().lists[0]?.version).toBe(3);
  });

  it.each(SUPPLIER_PRICE_LIST_STATES.filter((state) => state !== "EXTRACTED"))(
    "refuses a list that is %s",
    async (state) => {
      const store = setup(state);

      expect(await setSupplierPriceListRowPrice(store, input)).toEqual({ kind: "not_editable" });
      expect(store.snapshot().rows[0]?.priceCents).toBeNull();
    },
  );

  it("refuses a stale version, changing nothing", async () => {
    const store = setup();

    expect(await setSupplierPriceListRowPrice(store, { ...input, version: 2 })).toEqual({
      kind: "stale_version",
    });
    expect(store.snapshot().rows[0]?.priceCents).toBeNull();
  });
});

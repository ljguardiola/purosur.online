import { describe, expect, it } from "vitest";
import { SUPPLIER_PRICE_LIST_STATES } from "../model/supplier-price-list.js";
import { removeSupplierPriceListRow } from "./remove-supplier-price-list-row.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";

function setup(state: (typeof SUPPLIER_PRICE_LIST_STATES)[number] = "EXTRACTED") {
  const store = new FakeSupplierPriceListStore();
  store.seedList({ id: "list-1", state, version: 3 });
  store.seedList({ id: "list-2", state: "EXTRACTED", version: 7 });
  store.seedRow({ id: "row-1", listId: "list-1" });
  store.seedRow({ id: "row-2", listId: "list-1" });
  store.seedRow({ id: "row-3", listId: "list-2" });
  return store;
}

const input = { listId: "list-1", rowId: "row-1", version: 3, actorId: "person-1" };

describe("removeSupplierPriceListRow", () => {
  it("removes one row, keeps the others and advances the version", async () => {
    const store = setup();

    expect(await removeSupplierPriceListRow(store, input)).toEqual({ kind: "removed" });

    const state = store.snapshot();
    expect(state.rows.map((row) => row.id)).toEqual(["row-2", "row-3"]);
    expect(state.lists.map((list) => [list.id, list.version])).toEqual([
      ["list-1", 4],
      ["list-2", 7],
    ]);
    expect(store.lockCallOrder).toEqual(["lockList", "lockRow"]);
  });

  it("answers not_found for a missing list", async () => {
    expect(await removeSupplierPriceListRow(setup(), { ...input, listId: "missing" })).toEqual({
      kind: "not_found",
    });
  });

  it("answers not_found for a row of another list, changing nothing", async () => {
    const store = setup();

    expect(await removeSupplierPriceListRow(store, { ...input, rowId: "row-3" })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot().rows).toHaveLength(3);
  });

  it.each(SUPPLIER_PRICE_LIST_STATES.filter((state) => state !== "EXTRACTED"))(
    "refuses a list that is %s",
    async (state) => {
      const store = setup(state);

      expect(await removeSupplierPriceListRow(store, input)).toEqual({ kind: "not_editable" });
      expect(store.snapshot().rows).toHaveLength(3);
    },
  );

  it("refuses a stale version, changing nothing", async () => {
    const store = setup();

    expect(await removeSupplierPriceListRow(store, { ...input, version: 4 })).toEqual({
      kind: "stale_version",
    });
    expect(store.snapshot().rows).toHaveLength(3);
  });
});

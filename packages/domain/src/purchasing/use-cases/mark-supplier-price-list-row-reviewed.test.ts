import { describe, expect, it } from "vitest";
import {
  isSupplierPriceListUnderReview,
  SUPPLIER_PRICE_LIST_STATES,
  type SupplierPriceListState,
} from "../model/supplier-price-list.js";
import { markSupplierPriceListRowReviewed } from "./mark-supplier-price-list-row-reviewed.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";

function setup(state: SupplierPriceListState = "EXTRACTED") {
  const store = new FakeSupplierPriceListStore();
  store.seedList({ id: "list-1", state, version: 3 });
  store.seedRow({ id: "row-1", listId: "list-1" });
  return store;
}

const input = { listId: "list-1", rowId: "row-1", version: 3, actorId: "person-1" };

describe("markSupplierPriceListRowReviewed", () => {
  it("marks the row reviewed, keeping it unlinked, and advances the version", async () => {
    const store = setup();

    expect(await markSupplierPriceListRowReviewed(store, input)).toEqual({ kind: "reviewed" });

    const state = store.snapshot();
    expect(state.rows[0]).toMatchObject({ reviewed: true, editedBy: "person-1", link: null });
    expect(state.lists[0]?.version).toBe(4);
  });

  it("answers not_found for a missing list", async () => {
    expect(
      await markSupplierPriceListRowReviewed(setup(), { ...input, listId: "missing" }),
    ).toEqual({ kind: "not_found" });
  });

  it.each(SUPPLIER_PRICE_LIST_STATES.filter((state) => !isSupplierPriceListUnderReview(state)))(
    "refuses a row of a list that is %s",
    async (state) => {
      const store = setup(state);
      const before = store.snapshot();

      expect(await markSupplierPriceListRowReviewed(store, { ...input, version: 99 })).toEqual({
        kind: "not_editable",
      });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it("refuses a version other than the one loaded", async () => {
    const store = setup();
    const before = store.snapshot();

    expect(await markSupplierPriceListRowReviewed(store, { ...input, version: 2 })).toEqual({
      kind: "stale_version",
    });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not_found for a row that is not in the list", async () => {
    const store = setup();
    const before = store.snapshot();

    expect(await markSupplierPriceListRowReviewed(store, { ...input, rowId: "missing" })).toEqual({
      kind: "not_found",
    });
    expect(store.snapshot()).toEqual(before);
  });

  it("takes the locks of the list and then of the row", async () => {
    const store = setup();

    await markSupplierPriceListRowReviewed(store, input);

    expect(store.lockCallOrder).toEqual(["lockList", "lockRow"]);
  });
});

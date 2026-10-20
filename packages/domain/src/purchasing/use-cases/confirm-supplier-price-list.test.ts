import { describe, expect, it } from "vitest";
import { SUPPLIER_PRICE_LIST_STATES } from "../model/supplier-price-list.js";
import { confirmSupplierPriceList } from "./confirm-supplier-price-list.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";

const NOW = new Date("2026-03-12T15:00:00Z");

function setup(
  list: { state?: (typeof SUPPLIER_PRICE_LIST_STATES)[number]; listDate?: string | null } = {},
  prices: (number | null)[] = [100_050, 250],
) {
  const store = new FakeSupplierPriceListStore();
  store.seedList({
    id: "list-1",
    state: list.state ?? "EXTRACTED",
    listDate: list.listDate === undefined ? "2026-03-01" : list.listDate,
    version: 3,
  });
  prices.forEach((priceCents, index) => {
    store.seedRow({ id: `row-${index}`, listId: "list-1", priceCents });
  });
  return store;
}

const input = { listId: "list-1", version: 3, listDate: null, actorId: "person-1", now: NOW };

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

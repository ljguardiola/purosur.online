import { describe, expect, it } from "vitest";
import type { SUPPLIER_PRICE_LIST_STATES } from "../model/supplier-price-list.js";
import { discardSupplierPriceList } from "./discard-supplier-price-list.js";
import { FakeSupplierPriceListStore } from "./test-support/fake-supplier-price-list-store.js";

const NOW = new Date("2026-03-12T15:00:00Z");

function setup(state: (typeof SUPPLIER_PRICE_LIST_STATES)[number]) {
  const store = new FakeSupplierPriceListStore();
  store.seedList({ id: "list-1", state, version: 3 });
  store.seedRow({ id: "row-1", listId: "list-1" });
  return store;
}

const input = { listId: "list-1", version: 3, actorId: "person-1", now: NOW };

describe("discardSupplierPriceList", () => {
  it.each(["EXTRACTED", "READ_FAILED"] as const)("discards a list that is %s", async (state) => {
    const store = setup(state);

    expect(await discardSupplierPriceList(store, input)).toEqual({ kind: "discarded" });

    expect(store.snapshot().lists[0]).toMatchObject({
      state: "DISCARDED",
      discardedAt: NOW,
      discardedBy: "person-1",
      version: 4,
      confirmedAt: null,
    });
  });

  it("answers not_found for a missing list", async () => {
    expect(await discardSupplierPriceList(setup("EXTRACTED"), { ...input, listId: "x" })).toEqual({
      kind: "not_found",
    });
  });

  it.each(["READING", "REVIEWED", "DISCARDED"] as const)(
    "refuses a list that is %s",
    async (state) => {
      const store = setup(state);

      expect(await discardSupplierPriceList(store, input)).toEqual({ kind: "not_editable" });
      expect(store.snapshot().lists[0]?.state).toBe(state);
    },
  );

  it("refuses a stale version, changing nothing", async () => {
    const store = setup("EXTRACTED");

    expect(await discardSupplierPriceList(store, { ...input, version: 1 })).toEqual({
      kind: "stale_version",
    });
    expect(store.snapshot().lists[0]?.state).toBe("EXTRACTED");
  });
});

import { describe, expect, it } from "vitest";
import { recordStockMovement } from "./apply-stock-movement.js";
import type { NewStockMovement } from "./stock-store.js";
import { FakeStockStore } from "./test-support/fake-stock-store.js";

const KEY = { productId: "product-harina", locationId: "branch-1" };

function movement(overrides: Partial<NewStockMovement> = {}): NewStockMovement {
  return {
    ...KEY,
    kind: "assembly_out",
    reason: null,
    delta: -7_000,
    occurredAt: new Date("2026-03-10T15:00:00.000Z"),
    actorId: "person-1",
    supersededByCountId: null,
    ...overrides,
  };
}

function storeWithLots(): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: KEY.productId, saleUnit: "KG" });
  store.seedLot({ id: "late", ...KEY, expiresOn: "2027-06-01", remaining: 5_000 });
  store.seedLot({ id: "soon", ...KEY, expiresOn: "2027-01-01", remaining: 5_000 });
  return store;
}

function record(store: FakeStockStore, recorded: NewStockMovement) {
  return store.transaction((tx) => recordStockMovement(tx, recorded));
}

describe("recordStockMovement", () => {
  it("returns the allocations it applied, in the order of the lots it consumed", async () => {
    const store = storeWithLots();

    const { allocations } = await record(store, movement());

    expect(allocations).toEqual([
      { lotId: "soon", quantity: -5_000 },
      { lotId: "late", quantity: -2_000 },
    ]);
  });

  it("returns the technical lot it opened for a shortfall", async () => {
    const store = new FakeStockStore();
    store.seedProduct({ id: KEY.productId, saleUnit: "KG" });

    const { allocations } = await record(store, movement({ delta: -3_000 }));

    const [technical] = store.snapshot().lots;
    expect(technical?.technical).toBe(true);
    expect(allocations).toEqual([{ lotId: technical?.id, quantity: -3_000 }]);
  });

  it("returns no allocations for a movement of a kind that does not allocate to lots", async () => {
    const store = storeWithLots();

    const { allocations } = await record(store, movement({ kind: "assembly_in", delta: 4_000 }));

    expect(allocations).toEqual([]);
  });

  it("returns no allocations for a movement a count has superseded", async () => {
    const store = storeWithLots();

    const { allocations, balance } = await record(
      store,
      movement({ supersededByCountId: "count-1" }),
    );

    expect(balance).toBeNull();
    expect(allocations).toEqual([]);
  });
});

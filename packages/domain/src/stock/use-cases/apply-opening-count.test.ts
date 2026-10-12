import { describe, expect, it } from "vitest";
import { MAX_STOCK_QUANTITY } from "../model/stock-quantity.js";
import { type ApplyOpeningCountInput, applyOpeningCount } from "./apply-opening-count.js";
import { FakeStockStore } from "./test-support/fake-stock-store.js";

const COUNTED_AT = new Date("2026-03-10T15:00:00.000Z");
const BRANCH = "branch-1";
const YERBA = { productId: "product-yerba", locationId: BRANCH };
const HARINA = { productId: "product-harina", locationId: BRANCH };

function storeWithProducts(): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: "product-yerba", saleUnit: "UNIT" });
  store.seedProduct({ id: "product-harina", saleUnit: "KG" });
  return store;
}

function line(overrides: Partial<ApplyOpeningCountInput> = {}): ApplyOpeningCountInput {
  return {
    locationId: BRANCH,
    occurredAt: COUNTED_AT,
    actorId: "person-1",
    movementId: "movement-a",
    productId: "product-yerba",
    counted: 6_000,
    expiresOn: "2027-01-31",
    ...overrides,
  };
}

function apply(store: FakeStockStore, input: ApplyOpeningCountInput) {
  return store.transaction((tx) => applyOpeningCount(tx, input));
}

describe("applyOpeningCount", () => {
  it("records an opening count movement under the register's own movement id, at the moment it was counted", async () => {
    const store = storeWithProducts();

    const outcome = await apply(store, line());

    expect(outcome).toMatchObject({ kind: "recorded" });
    expect(store.snapshot().movements).toEqual([
      {
        id: "movement-a",
        ...YERBA,
        kind: "opening_count",
        reason: null,
        delta: 6_000,
        occurredAt: COUNTED_AT,
        actorId: "person-1",
        supersededByCountId: null,
      },
    ]);
  });

  it("grows the product's balance in the branch counted, starting one it had none of", async () => {
    const store = storeWithProducts();
    store.seedBalance({ ...YERBA, quantity: 1_000 });

    await apply(store, line());
    await apply(store, line({ movementId: "movement-b", productId: "product-harina", counted: 2_500 }));

    expect(store.balanceOf(YERBA)).toBe(7_000);
    expect(store.balanceOf(HARINA)).toBe(2_500);
    expect(store.balanceOf({ ...YERBA, locationId: "branch-2" })).toBe(0);
  });

  it("creates a lot of what was counted with its expiry, no purchase behind it and its cost incomplete", async () => {
    const store = storeWithProducts();

    const outcome = await apply(store, line());

    expect(store.snapshot().lots).toMatchObject([
      {
        ...YERBA,
        technical: false,
        purchaseLineId: null,
        originMovementId: "movement-a",
        quantityReceived: 6_000,
        expiresOn: "2027-01-31",
        costTotalCents: null,
        costQuantity: null,
        costComplete: false,
        withdrawn: false,
        remaining: 6_000,
      },
    ]);
    expect(outcome).toEqual({ kind: "recorded", lotId: "lot-1" });
  });

  it("makes one lot per line, so the same product counted with two expiry dates yields two lots", async () => {
    const store = storeWithProducts();

    await apply(store, line({ movementId: "movement-a", counted: 6_000, expiresOn: "2027-01-31" }));
    await apply(store, line({ movementId: "movement-b", counted: 4_000, expiresOn: "2027-06-30" }));

    expect(store.snapshot().lots).toMatchObject([
      { originMovementId: "movement-a", expiresOn: "2027-01-31", remaining: 6_000 },
      { originMovementId: "movement-b", expiresOn: "2027-06-30", remaining: 4_000 },
    ]);
    expect(store.balanceOf(YERBA)).toBe(10_000);
  });

  it("makes a lot with no expiry for a product that has none", async () => {
    const store = storeWithProducts();

    await apply(store, line({ expiresOn: null }));

    expect(store.snapshot().lots).toMatchObject([{ expiresOn: null }]);
  });

  it("repays the lots in debt first, keeping only the rest in the new lot", async () => {
    const store = storeWithProducts();
    store.seedLot({ id: "lot-debt", ...YERBA, technical: true, remaining: -2_000 });
    store.seedBalance({ ...YERBA, quantity: -2_000 });

    await apply(store, line());

    const lots = store.snapshot().lots;
    expect(lots.find((lot) => lot.id === "lot-debt")?.remaining).toBe(0);
    expect(lots.find((lot) => lot.originMovementId === "movement-a")?.remaining).toBe(4_000);
    expect(store.snapshot().allocations).toEqual([
      { movementId: "movement-a", lotId: "lot-2", quantity: 4_000 },
      { movementId: "movement-a", lotId: "lot-debt", quantity: 2_000 },
    ]);
  });

  it("says not found for a product that does not exist, writing nothing", async () => {
    const store = storeWithProducts();

    const outcome = await apply(store, line({ productId: "product-ghost" }));

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot().movements).toEqual([]);
    expect(store.snapshot().lots).toEqual([]);
  });

  it.each([
    ["zero", "product-yerba", 0],
    ["negative", "product-yerba", -1_000],
    ["a fraction of a unit for a product sold by the unit", "product-yerba", 1_500],
    ["above the largest quantity", "product-harina", MAX_STOCK_QUANTITY + 1],
    ["not a whole number of thousandths", "product-harina", 1.5],
  ])("refuses a quantity that is %s, writing nothing", async (_name, productId, counted) => {
    const store = storeWithProducts();

    const outcome = await apply(store, line({ productId, counted }));

    expect(outcome).toEqual({ kind: "invalid_quantity" });
    expect(store.snapshot().movements).toEqual([]);
    expect(store.snapshot().lots).toEqual([]);
    expect(store.balanceOf({ productId, locationId: BRANCH })).toBe(0);
  });

  it("accepts a fraction of a kilo for a product sold by weight", async () => {
    const store = storeWithProducts();

    const outcome = await apply(store, line({ productId: "product-harina", counted: 2_345 }));

    expect(outcome).toMatchObject({ kind: "recorded" });
    expect(store.balanceOf(HARINA)).toBe(2_345);
  });

  it("changes nothing when the same line arrives again", async () => {
    const store = storeWithProducts();
    await apply(store, line());
    const before = store.snapshot();

    const outcome = await apply(store, line());

    expect(outcome).toEqual({ kind: "already_applied" });
    expect(store.snapshot()).toEqual(before);
  });

  it("is superseded by a count dated after it: the movement is kept but the balance and the lots do not move", async () => {
    const store = storeWithProducts();
    const countId = store.seedMovement({
      ...YERBA,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: new Date("2026-03-11T10:00:00.000Z"),
      actorId: "person-2",
      supersededByCountId: null,
    });

    await apply(store, line());

    expect(store.snapshot().movements.find((movement) => movement.id === "movement-a")).toMatchObject(
      { kind: "opening_count", delta: 6_000, supersededByCountId: countId },
    );
    expect(store.balanceOf(YERBA)).toBe(0);
    expect(store.snapshot().lots).toMatchObject([{ originMovementId: "movement-a", remaining: 0 }]);
    expect(store.snapshot().allocations).toEqual([]);
  });

  it("locks the product's stock before anything else", async () => {
    const store = storeWithProducts();

    await apply(store, line());

    expect(store.operationOrder[0]).toBe("lockProductStock");
    expect(store.lockedProducts).toEqual(["product-yerba"]);
  });

  it("leaves nothing behind when a write fails", async () => {
    const store = storeWithProducts();
    store.failingWrites.add("recordInitialCountLot");
    const before = store.snapshot();

    await expect(apply(store, line())).rejects.toThrow("recordInitialCountLot failed");

    expect(store.snapshot()).toEqual(before);
  });
});

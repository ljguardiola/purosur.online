import { describe, expect, it } from "vitest";
import {
  type ApplyRegisterStockMovementsInput,
  applyRegisterStockMovements,
} from "./apply-register-stock-movements.js";
import { FakeStockStore } from "./test-support/fake-stock-store.js";

const SOLD_AT = new Date("2026-10-09T14:20:00.000Z");
const BEFORE_SALE = new Date("2026-10-09T12:00:00.000Z");
const AFTER_SALE = new Date("2026-10-09T16:00:00.000Z");
const BREAD = { productId: "product-bread", locationId: "branch-1" };
const CHEESE = { productId: "product-cheese", locationId: "branch-1" };

function storeWithProducts(): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: "product-cheese", saleUnit: "KG" });
  store.seedProduct({ id: "product-bread", saleUnit: "UNIT" });
  store.seedBalance({ ...BREAD, quantity: 10_000 });
  store.seedBalance({ ...CHEESE, quantity: 5000 });
  store.seedBalance({ productId: "product-bread", locationId: "branch-2", quantity: 8000 });
  return store;
}

function seedCount(store: FakeStockStore, occurredAt: Date): string {
  return store.seedMovement({
    ...BREAD,
    kind: "count",
    reason: null,
    delta: 0,
    occurredAt,
    actorId: "actor-2",
    supersededByCountId: null,
  });
}

function sale(
  movements: ApplyRegisterStockMovementsInput["movements"],
): ApplyRegisterStockMovementsInput {
  return { locationId: "branch-1", occurredAt: SOLD_AT, actorId: "cashier-1", movements };
}

function apply(store: FakeStockStore, input: ApplyRegisterStockMovementsInput) {
  return store.transaction((tx) => applyRegisterStockMovements(tx, input));
}

describe("applyRegisterStockMovements", () => {
  it("subtracts each sold quantity from its product's balance in the sale's branch only", async () => {
    const store = storeWithProducts();

    const outcome = await apply(
      store,
      sale([
        {
          id: "register-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-bread",
          kind: "sale",
          delta: -3000,
        },
        {
          id: "register-movement-2",
          saleLineId: "sale-line-2",
          productId: "product-cheese",
          kind: "sale",
          delta: -1250,
        },
      ]),
    );

    expect(outcome).toEqual({ kind: "applied" });
    expect(store.balanceOf(BREAD)).toBe(7000);
    expect(store.balanceOf(CHEESE)).toBe(3750);
    expect(store.balanceOf({ productId: "product-bread", locationId: "branch-2" })).toBe(8000);
  });

  it("records each movement under the id the register gave it, with the sale's moment and cashier", async () => {
    const store = storeWithProducts();

    await apply(
      store,
      sale([
        {
          id: "register-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-bread",
          kind: "sale",
          delta: -3000,
        },
      ]),
    );

    expect(store.snapshot().movements).toEqual([
      {
        id: "register-movement-1",
        ...BREAD,
        saleLineId: "sale-line-1",
        kind: "sale",
        reason: null,
        delta: -3000,
        occurredAt: SOLD_AT,
        actorId: "cashier-1",
        supersededByCountId: null,
      },
    ]);
  });

  it("applies two lines of the same product one after the other", async () => {
    const store = storeWithProducts();

    await apply(
      store,
      sale([
        {
          id: "register-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-bread",
          kind: "sale",
          delta: -3000,
        },
        {
          id: "register-movement-2",
          saleLineId: "sale-line-2",
          productId: "product-bread",
          kind: "sale",
          delta: -2000,
        },
      ]),
    );

    expect(store.balanceOf(BREAD)).toBe(5000);
  });

  it("lets the balance go negative", async () => {
    const store = storeWithProducts();

    await apply(
      store,
      sale([
        {
          id: "register-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-bread",
          kind: "sale",
          delta: -12_000,
        },
      ]),
    );

    expect(store.balanceOf(BREAD)).toBe(-2000);
  });

  it("keeps a movement dated at or before a registered count without changing the balance", async () => {
    const store = storeWithProducts();
    const countId = seedCount(store, AFTER_SALE);

    const outcome = await apply(
      store,
      sale([
        {
          id: "register-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-bread",
          kind: "sale",
          delta: -3000,
        },
      ]),
    );

    expect(outcome).toEqual({ kind: "applied" });
    expect(store.balanceOf(BREAD)).toBe(10_000);
    expect(store.snapshot().movements.at(-1)).toMatchObject({ supersededByCountId: countId });
  });

  it("applies a movement dated after every registered count", async () => {
    const store = storeWithProducts();
    seedCount(store, BEFORE_SALE);

    await apply(
      store,
      sale([
        {
          id: "register-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-bread",
          kind: "sale",
          delta: -3000,
        },
      ]),
    );

    expect(store.balanceOf(BREAD)).toBe(7000);
  });

  it("locks every product's stock in the order of its id before writing anything", async () => {
    const store = storeWithProducts();

    await apply(
      store,
      sale([
        {
          id: "register-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-cheese",
          kind: "sale",
          delta: -1250,
        },
        {
          id: "register-movement-2",
          saleLineId: "sale-line-2",
          productId: "product-bread",
          kind: "sale",
          delta: -3000,
        },
      ]),
    );

    expect(store.lockedProducts).toEqual(["product-bread", "product-cheese"]);
    expect(store.operationOrder).toEqual([
      "lockProductStock",
      "lockProductStock",
      "earliestCountAtOrAfter",
      "recordMovement",
      "addToBalance",
      "earliestCountAtOrAfter",
      "recordMovement",
      "addToBalance",
    ]);
  });

  it("answers not_found for a product that doesn't exist, writing nothing", async () => {
    const store = storeWithProducts();
    const before = store.snapshot();

    const outcome = await apply(
      store,
      sale([
        {
          id: "register-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-bread",
          kind: "sale",
          delta: -3000,
        },
        {
          id: "register-movement-2",
          saleLineId: "sale-line-2",
          productId: "missing",
          kind: "sale",
          delta: -1000,
        },
      ]),
    );

    expect(outcome).toEqual({ kind: "not_found", productId: "missing" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each([
    ["part of a unit of a product sold by the unit", "product-bread", -1500],
    ["a sale that adds stock", "product-cheese", 1250],
    ["a sale of nothing", "product-cheese", 0],
  ])("refuses %s, writing nothing", async (_case, productId, delta) => {
    const store = storeWithProducts();
    const before = store.snapshot();

    const outcome = await apply(
      store,
      sale([
        {
          id: "register-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-bread",
          kind: "sale",
          delta: -3000,
        },
        { id: "register-movement-2", saleLineId: "sale-line-2", productId, kind: "sale", delta },
      ]),
    );

    expect(outcome).toEqual({ kind: "invalid_quantity", productId });
    expect(store.snapshot()).toEqual(before);
  });
});

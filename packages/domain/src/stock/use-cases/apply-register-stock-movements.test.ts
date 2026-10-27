import { describe, expect, it } from "vitest";
import {
  type ApplyRegisterStockMovementsInput,
  applyRegisterStockMovements,
} from "./apply-register-stock-movements.js";
import { FakeStockStore } from "./test-support/fake-stock-store.js";

const SOLD_AT = new Date("2026-10-09T14:20:00.000Z");
const BEFORE_SALE = new Date("2026-10-09T12:00:00.000Z");
const AFTER_SALE = new Date("2026-10-09T16:00:00.000Z");
const AFTER_COUNT = new Date("2026-10-09T18:00:00.000Z");
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
      "productLots",
      "openTechnicalLot",
      "allocateToLot",
      "earliestCountAtOrAfter",
      "recordMovement",
      "addToBalance",
      "productLots",
      "openTechnicalLot",
      "allocateToLot",
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
  describe("a voided sale's return", () => {
    function returned(
      delta: number,
      productId = "product-bread",
    ): ApplyRegisterStockMovementsInput["movements"] {
      return [
        {
          id: "register-movement-9",
          saleLineId: "sale-line-1",
          productId,
          kind: "sale_void",
          delta,
        },
      ];
    }

    it("adds each returned quantity to its product's balance in the sale's branch only", async () => {
      const store = storeWithProducts();

      const outcome = await apply(store, sale(returned(3000)));

      expect(outcome).toEqual({ kind: "applied" });
      expect(store.balanceOf(BREAD)).toBe(13_000);
      expect(store.balanceOf({ productId: "product-bread", locationId: "branch-2" })).toBe(8000);
    });

    it("records the movement as a void of the sale line, under the id the register gave it", async () => {
      const store = storeWithProducts();

      await apply(store, sale(returned(3000)));

      expect(store.snapshot().movements).toEqual([
        {
          id: "register-movement-9",
          ...BREAD,
          saleLineId: "sale-line-1",
          kind: "sale_void",
          reason: null,
          delta: 3000,
          occurredAt: SOLD_AT,
          actorId: "cashier-1",
          supersededByCountId: null,
        },
      ]);
    });

    function seedSale(
      store: FakeStockStore,
      saleLineId: string,
      allocations: { lotId: string; quantity: number }[],
      location = BREAD,
    ): string {
      const movementId = store.seedMovement({
        ...location,
        saleLineId,
        kind: "sale",
        reason: null,
        delta: allocations.reduce((sum, allocation) => sum + allocation.quantity, 0),
        occurredAt: BEFORE_SALE,
        actorId: "cashier-1",
        supersededByCountId: null,
      });
      for (const allocation of allocations) {
        store.seedAllocation({ movementId, ...allocation });
      }
      return movementId;
    }

    function remainingByLot(store: FakeStockStore): Record<string, number> {
      return Object.fromEntries(store.snapshot().lots.map((lot) => [lot.id, lot.remaining]));
    }

    it("gives each lot back exactly what the sale took from it, leaving the product's other lots alone", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "soon", remaining: 0 });
      store.seedLot({ ...BREAD, id: "late", remaining: 1000 });
      store.seedLot({
        ...BREAD,
        id: "newest",
        remaining: 7000,
        receivedAt: new Date("2026-09-01T12:00:00.000Z"),
      });
      seedSale(store, "sale-line-1", [
        { lotId: "soon", quantity: -2000 },
        { lotId: "late", quantity: -1000 },
      ]);

      await apply(store, sale(returned(3000)));

      expect(remainingByLot(store)).toEqual({ soon: 2000, late: 2000, newest: 7000 });
      expect(
        store
          .snapshot()
          .allocations.filter(({ movementId }) => movementId === "register-movement-9"),
      ).toEqual([
        { movementId: "register-movement-9", lotId: "soon", quantity: 2000 },
        { movementId: "register-movement-9", lotId: "late", quantity: 1000 },
      ]);
    });

    it("ignores the allocations of another sale line, another branch's and the void's own", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "this-line", remaining: 0 });
      store.seedLot({
        ...BREAD,
        id: "other-line",
        remaining: 0,
        receivedAt: new Date("2026-09-01T12:00:00.000Z"),
      });
      seedSale(store, "sale-line-1", [{ lotId: "this-line", quantity: -3000 }]);
      seedSale(store, "sale-line-2", [{ lotId: "other-line", quantity: -4000 }]);
      seedSale(store, "sale-line-1", [{ lotId: "other-line", quantity: -5000 }], {
        ...BREAD,
        locationId: "branch-2",
      });

      await apply(store, sale(returned(3000)));

      expect(remainingByLot(store)).toEqual({ "this-line": 3000, "other-line": 0 });
    });

    it("gives a void dated after the count that superseded its sale to the most recently received lot", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "stocked", remaining: 10_000 });
      seedCount(store, AFTER_SALE);
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

      await apply(store, { ...sale(returned(3000)), occurredAt: AFTER_COUNT });

      expect(store.balanceOf(BREAD)).toBe(13_000);
      expect(remainingByLot(store)).toEqual({ stocked: 13_000 });
    });

    it("records no allocation for a void a count already supersedes", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "sold-from", remaining: 0 });
      seedSale(store, "sale-line-1", [{ lotId: "sold-from", quantity: -3000 }]);
      seedCount(store, AFTER_SALE);

      await apply(store, sale(returned(3000)));

      expect(store.snapshot().allocations).toEqual([
        { movementId: expect.any(String), lotId: "sold-from", quantity: -3000 },
      ]);
      expect(remainingByLot(store)).toEqual({ "sold-from": 0 });
    });

    it.each([
      ["part of a unit of a product sold by the unit", "product-bread", 1500],
      ["a return that takes stock away", "product-cheese", -1250],
      ["a return of nothing", "product-cheese", 0],
    ])("refuses %s, writing nothing", async (_case, productId, delta) => {
      const store = storeWithProducts();
      const before = store.snapshot();

      const outcome = await apply(store, sale(returned(delta, productId)));

      expect(outcome).toEqual({ kind: "invalid_quantity", productId });
      expect(store.snapshot()).toEqual(before);
    });
  });

  describe("lot allocation", () => {
    function breadSale(id: string, delta: number): ApplyRegisterStockMovementsInput["movements"] {
      return [{ id, saleLineId: `line-${id}`, productId: "product-bread", kind: "sale", delta }];
    }

    function remainingByLot(store: FakeStockStore): Record<string, number> {
      return Object.fromEntries(store.snapshot().lots.map((lot) => [lot.id, lot.remaining]));
    }

    it("takes a sale from the lots that expire soonest first, recording a portion for each", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "late", expiresOn: "2027-06-01", remaining: 4000 });
      store.seedLot({ ...BREAD, id: "soon", expiresOn: "2027-01-01", remaining: 2000 });
      store.seedLot({ ...BREAD, id: "never", expiresOn: null, remaining: 4000 });

      await apply(store, sale(breadSale("sale-1", -7000)));

      expect(store.snapshot().allocations).toEqual([
        { movementId: "sale-1", lotId: "soon", quantity: -2000 },
        { movementId: "sale-1", lotId: "late", quantity: -4000 },
        { movementId: "sale-1", lotId: "never", quantity: -1000 },
      ]);
      expect(remainingByLot(store)).toEqual({ soon: 0, late: 0, never: 3000 });
    });

    it("applies a sale of a product holding an expired lot without refusing it, taking the expired lot first", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "fresh", expiresOn: "2027-06-01", remaining: 4000 });
      store.seedLot({ ...BREAD, id: "expired", expiresOn: "2026-09-01", remaining: 2000 });

      const outcome = await apply(store, sale(breadSale("sale-1", -3000)));

      expect(outcome).toEqual({ kind: "applied" });
      expect(store.balanceOf(BREAD)).toBe(7000);
      expect(store.snapshot().allocations).toEqual([
        { movementId: "sale-1", lotId: "expired", quantity: -2000 },
        { movementId: "sale-1", lotId: "fresh", quantity: -1000 },
      ]);
    });

    it("leaves the lots of another branch and of another product alone", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "here", remaining: 5000 });
      store.seedLot({ ...BREAD, locationId: "branch-2", id: "elsewhere", remaining: 5000 });
      store.seedLot({ ...CHEESE, id: "other-product", remaining: 5000 });

      await apply(store, sale(breadSale("sale-1", -3000)));

      expect(remainingByLot(store)).toEqual({ here: 2000, elsewhere: 5000, "other-product": 5000 });
    });

    it("accumulates the sale of a product with no lot in a technical lot with no cost nor expiry", async () => {
      const store = storeWithProducts();

      await apply(store, sale(breadSale("sale-1", -3000)));

      const { lots, allocations } = store.snapshot();
      expect(lots).toHaveLength(1);
      expect(lots[0]).toMatchObject({
        ...BREAD,
        technical: true,
        expiresOn: null,
        costTotalCents: null,
        costComplete: false,
        remaining: -3000,
      });
      expect(allocations).toEqual([{ movementId: "sale-1", lotId: lots[0]?.id, quantity: -3000 }]);
    });

    it("reuses a product's technical lot instead of opening a second one", async () => {
      const store = storeWithProducts();

      await apply(store, sale(breadSale("sale-1", -3000)));
      await apply(store, sale(breadSale("sale-2", -1000)));

      const { lots } = store.snapshot();
      expect(lots).toHaveLength(1);
      expect(lots[0]?.remaining).toBe(-4000);
      expect(store.operationOrder.filter((name) => name === "openTechnicalLot")).toHaveLength(1);
    });

    it("allocates two movements of the same product in the order they are applied", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "first", expiresOn: "2027-01-01", remaining: 2000 });
      store.seedLot({ ...BREAD, id: "second", expiresOn: "2027-02-01", remaining: 5000 });

      await apply(store, sale([...breadSale("sale-1", -1000), ...breadSale("sale-2", -2000)]));

      expect(store.snapshot().allocations).toEqual([
        { movementId: "sale-1", lotId: "first", quantity: -1000 },
        { movementId: "sale-2", lotId: "first", quantity: -1000 },
        { movementId: "sale-2", lotId: "second", quantity: -1000 },
      ]);
    });

    it("records no allocation for a sale a count already supersedes", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "stocked", remaining: 5000 });
      seedCount(store, AFTER_SALE);

      await apply(store, sale(breadSale("sale-1", -3000)));

      expect(store.snapshot().allocations).toEqual([]);
      expect(remainingByLot(store)).toEqual({ stocked: 5000 });
      expect(store.operationOrder).not.toContain("productLots");
    });

    it.each(["openTechnicalLot", "allocateToLot"] as const)(
      "leaves nothing behind when %s fails",
      async (operation) => {
        const store = storeWithProducts();
        const before = store.snapshot();
        store.failingWrites.add(operation);

        await expect(apply(store, sale(breadSale("sale-1", -3000)))).rejects.toThrow(operation);

        expect(store.snapshot()).toEqual(before);
      },
    );

    it("leaves nothing behind when allocating to an existing lot fails", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "stocked", remaining: 5000 });
      const before = store.snapshot();
      store.failingWrites.add("allocateToLot");

      await expect(apply(store, sale(breadSale("sale-1", -3000)))).rejects.toThrow("allocateToLot");

      expect(store.snapshot()).toEqual(before);
    });
  });

  describe("a customer's return", () => {
    function restocked(delta: number): ApplyRegisterStockMovementsInput["movements"] {
      return [
        {
          id: "return-movement-1",
          saleLineId: "sale-line-1",
          productId: "product-bread",
          kind: "return",
          delta,
        },
      ];
    }

    function discarded(delta: number): ApplyRegisterStockMovementsInput["movements"] {
      return [
        ...restocked(delta),
        {
          id: "return-movement-2",
          productId: "product-bread",
          kind: "loss",
          reason: "return_discard",
          delta: -delta,
        },
      ];
    }

    it("adds the returned quantity to its product's balance in the return's branch only", async () => {
      const store = storeWithProducts();

      const outcome = await apply(store, sale(restocked(3000)));

      expect(outcome).toEqual({ kind: "applied" });
      expect(store.balanceOf(BREAD)).toBe(13_000);
      expect(store.balanceOf({ productId: "product-bread", locationId: "branch-2" })).toBe(8000);
    });

    it("records the movement as a return of the sale line, under the id the register gave it", async () => {
      const store = storeWithProducts();

      await apply(store, sale(restocked(3000)));

      expect(store.snapshot().movements).toEqual([
        {
          id: "return-movement-1",
          ...BREAD,
          saleLineId: "sale-line-1",
          kind: "return",
          reason: null,
          delta: 3000,
          occurredAt: SOLD_AT,
          actorId: "cashier-1",
          supersededByCountId: null,
        },
      ]);
    });

    it("leaves the balance unchanged when the returned merchandise is discarded, recording the loss with its system reason", async () => {
      const store = storeWithProducts();

      const outcome = await apply(store, sale(discarded(3000)));

      expect(outcome).toEqual({ kind: "applied" });
      expect(store.balanceOf(BREAD)).toBe(10_000);
      expect(
        store
          .snapshot()
          .movements.map(({ id, kind, reason, delta }) => ({ id, kind, reason, delta })),
      ).toEqual([
        { id: "return-movement-1", kind: "return", reason: null, delta: 3000 },
        { id: "return-movement-2", kind: "loss", reason: "return_discard", delta: -3000 },
      ]);
    });

    it("leaves every lot as it was when the returned merchandise is discarded", async () => {
      const store = storeWithProducts();
      store.seedLot({ ...BREAD, id: "late", expiresOn: "2027-06-01", remaining: 4000 });
      store.seedLot({ ...BREAD, id: "soon", expiresOn: "2027-01-01", remaining: 2000 });

      const outcome = await apply(store, sale(discarded(3000)));

      expect(outcome).toEqual({ kind: "applied" });
      expect(
        Object.fromEntries(store.snapshot().lots.map((lot) => [lot.id, lot.remaining])),
      ).toEqual({ late: 4000, soon: 2000 });
    });

    it("answers invalid_quantity for a quantity the product's unit can't be returned in, writing nothing", async () => {
      const store = storeWithProducts();
      const before = store.snapshot();

      const outcome = await apply(store, sale(discarded(1500)));

      expect(outcome).toEqual({ kind: "invalid_quantity", productId: "product-bread" });
      expect(store.snapshot()).toEqual(before);
    });
  });
});

import { describe, expect, it } from "vitest";
import type { PurchaseReceipt, ReceivedPurchaseLine } from "../model/stock-receipt.js";
import { receivePurchasedStock } from "./receive-purchased-stock.js";
import { FakeStockStore } from "./test-support/fake-stock-store.js";

const RECEIVED_AT = new Date("2026-03-10T15:00:00.000Z");
const BRANCH = "branch-1";
const YERBA = { productId: "product-yerba", locationId: BRANCH };
const HARINA = { productId: "product-harina", locationId: BRANCH };

function storeWithProducts(): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: "product-yerba", saleUnit: "UNIT" });
  store.seedProduct({ id: "product-harina", saleUnit: "KG" });
  store.seedBalance({ ...YERBA, quantity: 5_000 });
  store.seedBalance({ productId: "product-yerba", locationId: "branch-2", quantity: 7_000 });
  return store;
}

function yerbaLine(overrides: Partial<ReceivedPurchaseLine> = {}): ReceivedPurchaseLine {
  return {
    purchaseLineId: "purchase-line-1",
    productId: "product-yerba",
    quantity: 24_000,
    costPaidCents: 1_450_050,
    quantityPerPackage: 12_000,
    lotNumber: "L-17",
    expiresOn: "2027-01-31",
    ...overrides,
  };
}

function harinaLine(overrides: Partial<ReceivedPurchaseLine> = {}): ReceivedPurchaseLine {
  return {
    purchaseLineId: "purchase-line-2",
    productId: "product-harina",
    quantity: 2_500,
    costPaidCents: 90_000,
    quantityPerPackage: 1_000,
    lotNumber: null,
    expiresOn: null,
    ...overrides,
  };
}

function receipt(lines: ReceivedPurchaseLine[]): PurchaseReceipt {
  return {
    locationId: BRANCH,
    occurredAt: RECEIVED_AT,
    purchasedOn: "2026-03-09",
    actorId: "person-1",
    lines,
  };
}

function receive(store: FakeStockStore, received: PurchaseReceipt) {
  return store.transaction((tx) => receivePurchasedStock(tx, received));
}

function seedCount(store: FakeStockStore, key: typeof YERBA, occurredAt: Date): string {
  return store.seedMovement({
    ...key,
    kind: "count",
    reason: null,
    delta: 0,
    occurredAt,
    actorId: "person-2",
    supersededByCountId: null,
  });
}

describe("receivePurchasedStock", () => {
  it("records a receipt movement per line at the moment it was received, carrying its purchase line", async () => {
    const store = storeWithProducts();

    const outcome = await receive(store, receipt([yerbaLine(), harinaLine()]));

    expect(outcome).toEqual({ kind: "received" });
    expect(store.snapshot().movements).toEqual([
      {
        id: "movement-1",
        ...YERBA,
        kind: "receipt",
        reason: null,
        delta: 24_000,
        occurredAt: RECEIVED_AT,
        actorId: "person-1",
        purchaseLineId: "purchase-line-1",
        supersededByCountId: null,
      },
      {
        id: "movement-2",
        ...HARINA,
        kind: "receipt",
        reason: null,
        delta: 2_500,
        occurredAt: RECEIVED_AT,
        actorId: "person-1",
        purchaseLineId: "purchase-line-2",
        supersededByCountId: null,
      },
    ]);
  });

  it("grows each product's balance in the receipt's branch only, starting one it had none of", async () => {
    const store = storeWithProducts();

    await receive(store, receipt([yerbaLine(), harinaLine()]));

    expect(store.balanceOf(YERBA)).toBe(29_000);
    expect(store.balanceOf(HARINA)).toBe(2_500);
    expect(store.balanceOf({ productId: "product-yerba", locationId: "branch-2" })).toBe(7_000);
  });

  it("creates a lot per line with its exact cost pair, lot number and expiry", async () => {
    const store = storeWithProducts();

    await receive(store, receipt([yerbaLine(), harinaLine()]));

    expect(store.snapshot().lots).toMatchObject([
      {
        ...YERBA,
        technical: false,
        purchaseLineId: "purchase-line-1",
        quantityReceived: 24_000,
        costTotalCents: 1_450_050,
        costQuantity: 12_000,
        lotNumber: "L-17",
        expiresOn: "2027-01-31",
        purchasedOn: "2026-03-09",
        remaining: 24_000,
      },
      {
        ...HARINA,
        technical: false,
        purchaseLineId: "purchase-line-2",
        quantityReceived: 2_500,
        costTotalCents: 90_000,
        costQuantity: 1_000,
        lotNumber: null,
        expiresOn: null,
        purchasedOn: "2026-03-09",
        remaining: 2_500,
      },
    ]);
  });

  it("adds every line of the same product to its balance, one movement and one lot each", async () => {
    const store = storeWithProducts();

    await receive(
      store,
      receipt([yerbaLine(), yerbaLine({ purchaseLineId: "purchase-line-3", quantity: 12_000 })]),
    );

    const state = store.snapshot();
    expect(state.movements.map((movement) => movement.delta)).toEqual([24_000, 12_000]);
    expect(state.lots.map((lot) => lot.quantityReceived)).toEqual([24_000, 12_000]);
    expect(store.balanceOf(YERBA)).toBe(41_000);
  });

  it("records a receipt a count taken at or after it covers as superseded, leaving the balance alone", async () => {
    const store = storeWithProducts();
    const countId = seedCount(store, YERBA, RECEIVED_AT);

    await receive(store, receipt([yerbaLine()]));

    const state = store.snapshot();
    expect(state.movements.filter((movement) => movement.kind === "receipt")).toMatchObject([
      { supersededByCountId: countId },
    ]);
    expect(store.balanceOf(YERBA)).toBe(5_000);
    expect(state.lots).toHaveLength(1);
    expect(state.lots[0]?.remaining).toBe(0);
    expect(state.allocations).toEqual([]);
  });

  it("ignores a count taken before the receipt and a count of another branch", async () => {
    const store = storeWithProducts();
    seedCount(store, YERBA, new Date("2026-03-10T14:59:59.000Z"));
    seedCount(
      store,
      { productId: "product-yerba", locationId: "branch-2" },
      new Date("2026-03-11T15:00:00.000Z"),
    );

    await receive(store, receipt([yerbaLine()]));

    expect(
      store.snapshot().movements.filter((movement) => movement.kind === "receipt"),
    ).toMatchObject([{ supersededByCountId: null }]);
    expect(store.balanceOf(YERBA)).toBe(29_000);
  });

  it("locks every product's balance once, in id order, before recording anything", async () => {
    const store = storeWithProducts();

    await receive(
      store,
      receipt([yerbaLine(), harinaLine(), yerbaLine({ purchaseLineId: "purchase-line-3" })]),
    );

    expect(store.lockedProducts).toEqual(["product-harina", "product-yerba"]);
    expect(store.operationOrder.slice(0, 3)).toEqual([
      "lockProductStock",
      "lockProductStock",
      "earliestCountAtOrAfter",
    ]);
  });

  it("refuses a product the catalog does not have, naming it, before recording anything", async () => {
    const store = storeWithProducts();

    const outcome = await receive(
      store,
      receipt([harinaLine(), yerbaLine({ productId: "product-unknown" })]),
    );

    expect(outcome).toEqual({ kind: "not_found", productId: "product-unknown" });
    expect(store.operationOrder).toEqual(["lockProductStock", "lockProductStock"]);
  });

  it.each(["recordMovement", "addToBalance", "recordLot", "allocateToLot"] as const)(
    "leaves nothing behind when %s fails",
    async (operation) => {
      const store = storeWithProducts();
      const before = store.snapshot();
      store.failingWrites.add(operation);

      await expect(receive(store, receipt([yerbaLine(), harinaLine()]))).rejects.toThrow(operation);

      expect(store.snapshot()).toEqual(before);
    },
  );

  describe("lot allocation", () => {
    function storeWithTechnicalLot(remaining: number | null): FakeStockStore {
      const store = storeWithProducts();
      if (remaining !== null) {
        store.seedLot({ ...YERBA, id: "technical", technical: true, remaining });
      }
      return store;
    }

    function technicalRemaining(store: FakeStockStore): number | undefined {
      return store.snapshot().lots.find((lot) => lot.technical)?.remaining;
    }

    it("allocates what was received to the new lot, against the receipt's movement", async () => {
      const lotsStore = storeWithTechnicalLot(null);
      await receive(lotsStore, receipt([yerbaLine()]));

      const { lots, allocations } = lotsStore.snapshot();
      expect(allocations).toEqual([
        { movementId: "movement-1", lotId: lots[0]?.id, quantity: 24_000 },
      ]);
    });

    it("carries a technical lot's debt into the new lot and brings the technical lot to zero", async () => {
      const lotsStore = storeWithTechnicalLot(-5_000);

      await receive(lotsStore, receipt([yerbaLine({ quantity: 24_000 })]));

      const newLot = lotsStore.snapshot().lots.find((lot) => !lot.technical);
      expect(newLot?.remaining).toBe(19_000);
      expect(technicalRemaining(lotsStore)).toBe(0);
      expect(lotsStore.snapshot().allocations).toEqual([
        { movementId: "movement-1", lotId: newLot?.id, quantity: 19_000 },
        { movementId: "movement-1", lotId: "technical", quantity: 5_000 },
      ]);
    });

    it("leaves a positive technical lot as its own lot", async () => {
      const lotsStore = storeWithTechnicalLot(3_000);

      await receive(lotsStore, receipt([yerbaLine()]));

      expect(technicalRemaining(lotsStore)).toBe(3_000);
      expect(lotsStore.snapshot().lots.find((lot) => !lot.technical)?.remaining).toBe(24_000);
    });

    it("regularizes the technical lot once for two lines of the same product", async () => {
      const lotsStore = storeWithTechnicalLot(-30_000);

      await receive(
        lotsStore,
        receipt([yerbaLine(), yerbaLine({ purchaseLineId: "purchase-line-3", quantity: 12_000 })]),
      );

      const [first, second] = lotsStore.snapshot().lots.filter((lot) => !lot.technical);
      expect(technicalRemaining(lotsStore)).toBe(0);
      expect(first?.remaining).toBe(-6_000);
      expect(second?.remaining).toBe(12_000);
    });

    it("records no allocation for a receipt a count already supersedes", async () => {
      const lotsStore = storeWithTechnicalLot(-5_000);
      seedCount(lotsStore, YERBA, RECEIVED_AT);

      await receive(lotsStore, receipt([yerbaLine()]));

      expect(lotsStore.snapshot().allocations).toEqual([]);
      expect(technicalRemaining(lotsStore)).toBe(-5_000);
    });
  });
});

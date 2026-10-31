import { describe, expect, it } from "vitest";
import { type Fraction, MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import type { LoadedSupplierPrice } from "../model/lot-reference-cost.js";
import { type SetLotReferenceCostInput, setLotReferenceCost } from "./set-lot-reference-cost.js";
import { type FakeCostLot, FakeLotCostStore } from "./test-support/fake-lot-cost-store.js";

const BRANCH = "branch-1";

function lot(id: string, overrides: Partial<FakeCostLot> = {}): FakeCostLot {
  return {
    id,
    productId: "product-1",
    locationId: BRANCH,
    origin: "initial_count",
    withdrawn: false,
    remaining: 1_000,
    cost: null,
    costIncomplete: true,
    ...overrides,
  };
}

function input(overrides: Partial<SetLotReferenceCostInput> = {}): SetLotReferenceCostInput {
  return { locationId: BRANCH, lotId: "lot-1", choice: typed(1_234), ...overrides };
}

function typed(unitCostCents: number): SetLotReferenceCostInput["choice"] {
  return { kind: "typed", unitCostCents };
}

function chosen(supplierItemId: string): SetLotReferenceCostInput["choice"] {
  return { kind: "supplier_price", supplierItemId };
}

function loadedPrice(
  supplierItemId: string,
  pricePerSaleUnit: Fraction,
  overrides: Partial<LoadedSupplierPrice> = {},
): LoadedSupplierPrice {
  return {
    supplierItemId,
    supplierName: "Distribuidora Sur",
    quantity: 12_000,
    saleUnit: "UNIT",
    listDate: "2026-03-01",
    pricePerSaleUnit,
    ...overrides,
  };
}

describe("setLotReferenceCost", () => {
  it("types the cost per sale unit as the exact fraction of one unit and no longer leaves it incomplete", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);

    const outcome = await setLotReferenceCost({ store }, input());

    expect(outcome).toEqual({ kind: "set" });
    expect(store.lots[0]).toMatchObject({
      cost: { totalCents: 1_234, quantity: 1_000 },
      costIncomplete: false,
    });
  });

  it("lets the cost be typed again later, replacing the earlier one", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);
    await setLotReferenceCost({ store }, input());

    const outcome = await setLotReferenceCost({ store }, input({ choice: typed(1_500) }));

    expect(outcome).toEqual({ kind: "set" });
    expect(store.lots[0]).toMatchObject({
      cost: { totalCents: 1_500, quantity: 1_000 },
      costIncomplete: false,
    });
  });

  it("changes only the lot asked for", async () => {
    const store = new FakeLotCostStore([lot("lot-1"), lot("lot-2")]);

    await setLotReferenceCost({ store }, input());

    expect(store.lots[1]).toMatchObject({ cost: null, costIncomplete: true });
  });

  it("says not found for a lot that does not exist", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);

    expect(await setLotReferenceCost({ store }, input({ lotId: "lot-ghost" }))).toEqual({
      kind: "not_found",
    });
  });

  it("says not found for a lot of another branch", async () => {
    const store = new FakeLotCostStore([lot("lot-1", { locationId: "branch-2" })]);

    expect(await setLotReferenceCost({ store }, input())).toEqual({ kind: "not_found" });
    expect(store.lots[0]).toMatchObject({ cost: null, costIncomplete: true });
  });

  it.each(["purchase", "technical", "assembly_batch"] as const)(
    "refuses a %s lot, whose cost does not come from the initial count",
    async (origin) => {
      const store = new FakeLotCostStore([
        lot("lot-1", { origin, cost: { totalCents: 500, quantity: 1_000 }, costIncomplete: false }),
      ]);

      const outcome = await setLotReferenceCost({ store }, input());

      expect(outcome).toEqual({ kind: "not_an_initial_count_lot" });
      expect(store.lots[0]?.cost).toEqual({ totalCents: 500, quantity: 1_000 });
    },
  );

  it.each([0, -2_000])("refuses the lot of a withdrawn line that holds %s", async (remaining) => {
    const store = new FakeLotCostStore([lot("lot-1", { withdrawn: true, remaining })]);

    const outcome = await setLotReferenceCost({ store }, input());

    expect(outcome).toEqual({ kind: "lot_withdrawn" });
    expect(store.lots[0]).toMatchObject({ cost: null, costIncomplete: true });
  });

  it("types the cost of a withdrawn line's lot that still holds stock", async () => {
    const store = new FakeLotCostStore([lot("lot-1", { withdrawn: true, remaining: 1 })]);

    const outcome = await setLotReferenceCost({ store }, input());

    expect(outcome).toEqual({ kind: "set" });
    expect(store.lots[0]).toMatchObject({
      cost: { totalCents: 1_234, quantity: 1_000 },
      costIncomplete: false,
    });
  });

  it.each([0, -2_000])(
    "types the cost of a lot of a line not withdrawn that holds %s",
    async (remaining) => {
      const store = new FakeLotCostStore([lot("lot-1", { remaining })]);

      expect(await setLotReferenceCost({ store }, input())).toEqual({ kind: "set" });
    },
  );

  it.each([0, -1, 10.5, MAX_CASH_AMOUNT_CENTS + 1, Number.NaN])(
    "refuses the cost %s without reading anything",
    async (unitCostCents) => {
      const store = new FakeLotCostStore([lot("lot-1")]);

      const outcome = await setLotReferenceCost({ store }, input({ choice: typed(unitCostCents) }));

      expect(outcome).toEqual({ kind: "invalid_cost" });
      expect(store.lockedLots).toEqual([]);
    },
  );

  it("accepts the largest amount", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);

    const outcome = await setLotReferenceCost(
      { store },
      input({ choice: typed(MAX_CASH_AMOUNT_CENTS) }),
    );

    expect(outcome).toEqual({ kind: "set" });
  });

  it("locks the lot before changing it", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);

    await setLotReferenceCost({ store }, input());

    expect(store.lockedLots).toEqual(["lot-1"]);
  });

  it("leaves the lot as it was when the write fails", async () => {
    const store = new FakeLotCostStore([lot("lot-1")]);
    store.failingWrite = true;

    await expect(setLotReferenceCost({ store }, input())).rejects.toThrow(
      "setReferenceCost failed",
    );

    expect(store.lots[0]).toMatchObject({ cost: null, costIncomplete: true });
  });

  describe("with supplier prices loaded for the lot's product", () => {
    const CHEAP = loadedPrice("item-cheap", { numerator: 1_000n, denominator: 3n });
    const DEAR = loadedPrice("item-dear", { numerator: 900n, denominator: 1n });

    function storeWithPrices(overrides: Partial<FakeCostLot> = {}): FakeLotCostStore {
      const store = new FakeLotCostStore([lot("lot-1", overrides)]);
      store.seedSupplierPrices("product-1", [DEAR, CHEAP]);
      store.seedSupplierPrices("product-2", [
        loadedPrice("item-other", { numerator: 1n, denominator: 1n }),
      ]);
      return store;
    }

    it("sets the exact cost of the price chosen, never rounded", async () => {
      const store = storeWithPrices();

      const outcome = await setLotReferenceCost({ store }, input({ choice: chosen("item-cheap") }));

      expect(outcome).toEqual({ kind: "set" });
      expect(store.lots[0]).toMatchObject({
        cost: { totalCents: 1, quantity: 3 },
        costIncomplete: false,
      });
    });

    it("lets another loaded price be chosen later, replacing the earlier one", async () => {
      const store = storeWithPrices();
      await setLotReferenceCost({ store }, input({ choice: chosen("item-cheap") }));

      await setLotReferenceCost({ store }, input({ choice: chosen("item-dear") }));

      expect(store.lots[0]).toMatchObject({ cost: { totalCents: 9, quantity: 10 } });
    });

    it("refuses a typed cost, whatever the amount", async () => {
      const store = storeWithPrices();

      const outcome = await setLotReferenceCost({ store }, input({ choice: typed(1_234) }));

      expect(outcome).toEqual({ kind: "cost_chosen_from_supplier_prices" });
      expect(store.lots[0]).toMatchObject({ cost: null, costIncomplete: true });
    });

    it("refuses a supplier item that has no price loaded for the product", async () => {
      const store = storeWithPrices();

      expect(await setLotReferenceCost({ store }, input({ choice: chosen("item-other") }))).toEqual(
        { kind: "supplier_price_not_found" },
      );
      expect(await setLotReferenceCost({ store }, input({ choice: chosen("item-ghost") }))).toEqual(
        { kind: "supplier_price_not_found" },
      );
      expect(store.lots[0]).toMatchObject({ cost: null, costIncomplete: true });
    });

    it("refuses a price whose exact cost cannot be stored as if it were not loaded", async () => {
      const store = storeWithPrices();
      store.seedSupplierPrices("product-1", [
        loadedPrice("item-huge", { numerator: 1n, denominator: BigInt(Number.MAX_SAFE_INTEGER) }),
      ]);

      expect(await setLotReferenceCost({ store }, input({ choice: chosen("item-huge") }))).toEqual({
        kind: "supplier_price_not_found",
      });
      expect(await setLotReferenceCost({ store }, input({ choice: typed(1_234) }))).toEqual({
        kind: "set",
      });
    });

    it("keeps the earlier refusals first: not found, not an initial count lot, withdrawn", async () => {
      const ghost = storeWithPrices();
      expect(
        await setLotReferenceCost(
          { store: ghost },
          input({ lotId: "lot-ghost", choice: chosen("item-ghost") }),
        ),
      ).toEqual({ kind: "not_found" });
      expect(
        await setLotReferenceCost(
          { store: storeWithPrices({ origin: "purchase" }) },
          input({ choice: typed(1_234) }),
        ),
      ).toEqual({ kind: "not_an_initial_count_lot" });
      expect(
        await setLotReferenceCost(
          { store: storeWithPrices({ withdrawn: true, remaining: 0 }) },
          input({ choice: chosen("item-ghost") }),
        ),
      ).toEqual({ kind: "lot_withdrawn" });
    });

    it("reads the prices of the lot's own product only after locking the lot", async () => {
      const store = storeWithPrices();

      await setLotReferenceCost({ store }, input({ choice: chosen("item-cheap") }));

      expect(store.operations).toEqual([
        "lockLot",
        "loadedSupplierPrices:product-1",
        "setReferenceCost",
      ]);
    });

    it("sets the cost of a price given by a fraction that is not reduced", async () => {
      const store = storeWithPrices();
      store.seedSupplierPrices("product-1", [
        loadedPrice("item-a", { numerator: 500n, denominator: 2n }),
      ]);

      await setLotReferenceCost({ store }, input({ choice: chosen("item-a") }));

      expect(store.lots[0]).toMatchObject({ cost: { totalCents: 1, quantity: 4 } });
    });
  });
});

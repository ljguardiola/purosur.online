import { describe, expect, it } from "vitest";
import type { Recipe } from "./recipe-store.js";
import {
  type RegisterAssemblyBatchInput,
  type RegisterAssemblyBatchOutcome,
  registerAssemblyBatch,
} from "./register-assembly-batch.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";

const ASSEMBLED_AT = new Date("2026-05-04T13:00:00.000Z");
const BRANCH = "branch-1";
const MIX = { productId: "product-mix", locationId: BRANCH };
const NUTS = { productId: "product-nuts", locationId: BRANCH };
const BAG = { productId: "product-bag", locationId: BRANCH };

const RECIPE: Recipe = {
  productId: MIX.productId,
  version: 2,
  components: [
    { componentProductId: NUTS.productId, quantityPerOutputUnit: 600 },
    { componentProductId: BAG.productId, quantityPerOutputUnit: 1_000 },
  ],
};

function storeWithRecipe({ nutsInLots = true } = {}): FakeStockStore {
  const store = new FakeStockStore();
  store.seedProduct({ id: MIX.productId, saleUnit: "KG" });
  store.seedProduct({ id: NUTS.productId, saleUnit: "KG" });
  store.seedProduct({ id: BAG.productId, saleUnit: "UNIT" });
  store.seedRecipe(RECIPE);
  store.seedBalance({ ...NUTS, quantity: 15_000 });
  store.seedBalance({ ...BAG, quantity: 50_000 });
  if (nutsInLots) {
    store.seedLot({
      id: "nuts-late",
      ...NUTS,
      remaining: 10_000,
      expiresOn: "2027-03-01",
      costTotalCents: 5_000,
      costQuantity: 1_000,
    });
    store.seedLot({
      id: "nuts-soon",
      ...NUTS,
      remaining: 5_000,
      expiresOn: "2027-01-15",
      costTotalCents: 3_000,
      costQuantity: 1_000,
    });
  }
  store.seedLot({
    id: "bag-lot",
    ...BAG,
    remaining: 50_000,
    expiresOn: null,
    costTotalCents: 100,
    costQuantity: 1_000,
  });
  return store;
}

function input(overrides: Partial<RegisterAssemblyBatchInput> = {}): RegisterAssemblyBatchInput {
  return {
    productId: MIX.productId,
    locationId: BRANCH,
    recipeVersion: 2,
    used: [
      { componentProductId: NUTS.productId, quantity: 12_000 },
      { componentProductId: BAG.productId, quantity: 2_000 },
    ],
    output: 14_000,
    actorId: "person-1",
    ...overrides,
  };
}

function register(
  store: FakeStockStore,
  overrides: Partial<RegisterAssemblyBatchInput> = {},
): Promise<RegisterAssemblyBatchOutcome> {
  return registerAssemblyBatch({ store, clock: new FixedClock(ASSEMBLED_AT) }, input(overrides));
}

describe("registerAssemblyBatch", () => {
  it("records the batch with what was used, the output obtained, the moment and who made it", async () => {
    const store = storeWithRecipe();

    const outcome = await register(store);

    expect(outcome.kind).toBe("recorded");
    expect(store.snapshot().batches).toEqual([
      {
        id: "batch-1",
        productId: MIX.productId,
        locationId: BRANCH,
        assembledAt: ASSEMBLED_AT,
        output: 14_000,
        actorId: "person-1",
        lines: [
          { componentProductId: NUTS.productId, quantity: 12_000 },
          { componentProductId: BAG.productId, quantity: 2_000 },
        ],
      },
    ]);
  });

  it("consumes each used component by an assembly movement linked to the batch, and adds the output by another", async () => {
    const store = storeWithRecipe();

    await register(store);

    const movements = store.snapshot().movements.map((movement) => ({
      productId: movement.productId,
      kind: movement.kind,
      reason: movement.reason,
      delta: movement.delta,
      occurredAt: movement.occurredAt,
      actorId: movement.actorId,
      assemblyBatchId: movement.assemblyBatchId,
    }));
    expect(movements).toEqual([
      {
        productId: NUTS.productId,
        kind: "assembly_out",
        reason: null,
        delta: -12_000,
        occurredAt: ASSEMBLED_AT,
        actorId: "person-1",
        assemblyBatchId: "batch-1",
      },
      {
        productId: BAG.productId,
        kind: "assembly_out",
        reason: null,
        delta: -2_000,
        occurredAt: ASSEMBLED_AT,
        actorId: "person-1",
        assemblyBatchId: "batch-1",
      },
      {
        productId: MIX.productId,
        kind: "assembly_in",
        reason: null,
        delta: 14_000,
        occurredAt: ASSEMBLED_AT,
        actorId: "person-1",
        assemblyBatchId: "batch-1",
      },
    ]);
  });

  it("moves the balances of the components down and of the assembled product up", async () => {
    const store = storeWithRecipe();

    await register(store);

    expect(store.balanceOf(NUTS)).toBe(3_000);
    expect(store.balanceOf(BAG)).toBe(48_000);
    expect(store.balanceOf(MIX)).toBe(14_000);
  });

  it("consumes the component lots by the same rule as a sale, the soonest expiry first", async () => {
    const store = storeWithRecipe();

    await register(store);

    const lots = store.snapshot().lots;
    expect(lots.find((lot) => lot.id === "nuts-soon")?.remaining).toBe(0);
    expect(lots.find((lot) => lot.id === "nuts-late")?.remaining).toBe(3_000);
  });

  it("opens the batch's own lot with the exact cost of what was consumed, the output as its cost quantity, the soonest expiry and no lot number", async () => {
    const store = storeWithRecipe();

    await register(store);

    const batchLot = store.snapshot().lots.find((lot) => lot.assemblyBatchId === "batch-1");
    expect(batchLot).toMatchObject({
      ...MIX,
      assemblyBatchId: "batch-1",
      quantityReceived: 14_000,
      costTotalCents: 50_200,
      costQuantity: 14_000,
      costComplete: true,
      expiresOn: "2027-01-15",
      lotNumber: null,
      purchaseLineId: null,
      originMovementId: null,
      remaining: 14_000,
    });
  });

  it("answers the batch with its unit cost rounded only for showing, and its expiry", async () => {
    const store = storeWithRecipe();

    const outcome = await register(store);

    expect(outcome).toEqual({
      kind: "recorded",
      batch: {
        id: "batch-1",
        productId: MIX.productId,
        locationId: BRANCH,
        assembledAt: ASSEMBLED_AT,
        output: 14_000,
        unitCostCents: 3_586,
        costIncomplete: false,
        expiresOn: "2027-01-15",
      },
    });
  });

  it("leaves a component that went unused out of the batch's movements and lines", async () => {
    const store = storeWithRecipe();

    await register(store, {
      used: [
        { componentProductId: NUTS.productId, quantity: 6_000 },
        { componentProductId: BAG.productId, quantity: 0 },
      ],
      output: 6_000,
    });

    const snapshot = store.snapshot();
    expect(snapshot.movements.map((movement) => movement.productId)).toEqual([
      NUTS.productId,
      MIX.productId,
    ]);
    expect(snapshot.batches[0]?.lines).toEqual([
      { componentProductId: NUTS.productId, quantity: 6_000 },
      { componentProductId: BAG.productId, quantity: 0 },
    ]);
    expect(store.balanceOf(BAG)).toBe(50_000);
  });

  it("marks the batch's lot incomplete and gives it no unit cost when a component had no lot to give and landed on a technical lot", async () => {
    const store = storeWithRecipe({ nutsInLots: false });

    const outcome = await register(store, {
      used: [
        { componentProductId: NUTS.productId, quantity: 17_000 },
        { componentProductId: BAG.productId, quantity: 2_000 },
      ],
      output: 19_000,
    });

    const snapshot = store.snapshot();
    expect(snapshot.lots.find((lot) => lot.assemblyBatchId === "batch-1")).toMatchObject({
      costComplete: false,
      costQuantity: 19_000,
      costTotalCents: 200,
    });
    expect(outcome).toMatchObject({
      kind: "recorded",
      batch: { unitCostCents: null, costIncomplete: true },
    });
  });

  it("marks the batch's lot incomplete when a consumed lot has an incomplete cost, adding only the known parts", async () => {
    const store = storeWithRecipe();
    store.seedLot({
      id: "bag-unknown",
      ...BAG,
      remaining: 1_000,
      purchasedOn: "2025-01-01",
      costComplete: false,
      costTotalCents: null,
      costQuantity: null,
    });

    await register(store);

    const batchLot = store.snapshot().lots.find((lot) => lot.assemblyBatchId === "batch-1");
    expect(batchLot).toMatchObject({ costComplete: false, costTotalCents: 50_100 });
  });

  it("gives the batch's lot no expiry when no consumed lot has one", async () => {
    const store = storeWithRecipe();

    await register(store, {
      used: [
        { componentProductId: NUTS.productId, quantity: 0 },
        { componentProductId: BAG.productId, quantity: 2_000 },
      ],
      output: 2_000,
    });

    const batchLot = store.snapshot().lots.find((lot) => lot.assemblyBatchId === "batch-1");
    expect(batchLot?.expiresOn).toBeNull();
  });

  it("covers the debt of the assembled product's lots with the output before keeping the rest", async () => {
    const store = storeWithRecipe();
    store.seedLot({
      id: "mix-debt",
      ...MIX,
      remaining: -3_000,
      costTotalCents: 10,
      costQuantity: 1_000,
    });
    store.seedBalance({ ...MIX, quantity: -3_000 });

    await register(store);

    const snapshot = store.snapshot();
    expect(snapshot.lots.find((lot) => lot.id === "mix-debt")?.remaining).toBe(0);
    expect(snapshot.lots.find((lot) => lot.assemblyBatchId === "batch-1")?.remaining).toBe(11_000);
  });

  it("does not move a balance a later count already covers", async () => {
    const store = storeWithRecipe();
    const countId = store.seedMovement({
      ...MIX,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: new Date("2026-05-04T14:00:00.000Z"),
      actorId: "person-2",
      supersededByCountId: null,
    });

    await register(store);

    const [assemblyIn] = store
      .snapshot()
      .movements.filter((movement) => movement.kind === "assembly_in");
    expect(assemblyIn?.supersededByCountId).toBe(countId);
    expect(store.balanceOf(MIX)).toBe(0);
  });

  it("locks the assembled product and its components in product order before reading the recipe or writing anything", async () => {
    const store = storeWithRecipe();

    await register(store);

    expect(store.lockedProducts).toEqual([BAG.productId, MIX.productId, NUTS.productId]);
    const [first, second, third, fourth] = store.operationOrder;
    expect([first, second, third]).toEqual([
      "lockProductStock",
      "lockProductStock",
      "lockProductStock",
    ]);
    expect(fourth).toBe("recipe");
  });

  it("writes nothing when a write fails, leaving the batch, the movements and the lots as they were", async () => {
    const failing = [
      "insertAssemblyBatch",
      "recordMovement",
      "allocateToLot",
      "recordBatchLot",
      "addToBalance",
    ] as const;
    for (const operation of failing) {
      const store = storeWithRecipe();
      const before = store.snapshot();
      store.failingWrites.add(operation);

      await expect(register(store)).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot()).toEqual(before);
    }
  });
});

describe("registerAssemblyBatch refusals", () => {
  async function refusal(
    overrides: Partial<RegisterAssemblyBatchInput>,
    store = storeWithRecipe(),
  ) {
    const before = store.snapshot();
    const outcome = await register(store, overrides);
    expect(store.snapshot().batches).toEqual(before.batches);
    expect(store.snapshot().movements).toEqual(before.movements);
    expect(store.snapshot().lots).toEqual(before.lots);
    return outcome;
  }

  it("refuses an assembled product that has no recipe", async () => {
    const store = storeWithRecipe();
    store.seedProduct({ id: "product-plain", saleUnit: "UNIT" });

    expect(await refusal({ productId: "product-plain" }, store)).toEqual({ kind: "no_recipe" });
  });

  it("refuses a product that does not exist", async () => {
    expect(await refusal({ productId: "product-missing" })).toEqual({ kind: "product_not_found" });
  });

  it("refuses an assembled product that is no longer active", async () => {
    const store = new FakeStockStore();
    store.seedProduct({ id: MIX.productId, saleUnit: "KG", active: false });
    store.seedProduct({ id: NUTS.productId, saleUnit: "KG" });
    store.seedProduct({ id: BAG.productId, saleUnit: "UNIT" });
    store.seedRecipe(RECIPE);

    expect(await refusal({}, store)).toEqual({ kind: "product_not_found" });
  });

  it("refuses a component that is no longer active", async () => {
    const store = new FakeStockStore();
    store.seedProduct({ id: MIX.productId, saleUnit: "KG" });
    store.seedProduct({ id: NUTS.productId, saleUnit: "KG", active: false });
    store.seedProduct({ id: BAG.productId, saleUnit: "UNIT" });
    store.seedRecipe(RECIPE);

    expect(await refusal({}, store)).toEqual({ kind: "product_not_found" });
  });

  it("refuses a batch made from a version of the recipe that is no longer the current one", async () => {
    expect(await refusal({ recipeVersion: 1 })).toEqual({ kind: "stale_recipe" });
  });

  it.each([
    ["omits a component of the recipe", [{ componentProductId: NUTS.productId, quantity: 1_000 }]],
    [
      "adds a component the recipe does not have",
      [
        { componentProductId: NUTS.productId, quantity: 1_000 },
        { componentProductId: BAG.productId, quantity: 1_000 },
        { componentProductId: MIX.productId, quantity: 1_000 },
      ],
    ],
    [
      "repeats a component",
      [
        { componentProductId: NUTS.productId, quantity: 1_000 },
        { componentProductId: NUTS.productId, quantity: 1_000 },
        { componentProductId: BAG.productId, quantity: 1_000 },
      ],
    ],
    [
      "names a component the recipe does not have in place of one it has",
      [
        { componentProductId: NUTS.productId, quantity: 1_000 },
        { componentProductId: "product-other", quantity: 1_000 },
      ],
    ],
  ])("refuses a batch whose used components %s", async (_name, used) => {
    expect(await refusal({ used })).toEqual({ kind: "stale_recipe" });
  });

  it("refuses a used quantity that is not valid for its component, naming it", async () => {
    expect(
      await refusal({
        used: [
          { componentProductId: NUTS.productId, quantity: 12_000 },
          { componentProductId: BAG.productId, quantity: 2_500 },
        ],
      }),
    ).toEqual({ kind: "invalid_quantity", componentProductId: BAG.productId });
  });

  it("refuses a batch that used nothing", async () => {
    expect(
      await refusal({
        used: [
          { componentProductId: NUTS.productId, quantity: 0 },
          { componentProductId: BAG.productId, quantity: 0 },
        ],
      }),
    ).toEqual({ kind: "nothing_used" });
  });

  it.each([0, -1_000, 1.5])("refuses an output of %s", async (output) => {
    expect(await refusal({ output })).toEqual({ kind: "invalid_output" });
  });

  it("refuses a fractional output of a product sold by the unit", async () => {
    const store = new FakeStockStore();
    store.seedProduct({ id: MIX.productId, saleUnit: "UNIT" });
    store.seedProduct({ id: NUTS.productId, saleUnit: "KG" });
    store.seedProduct({ id: BAG.productId, saleUnit: "UNIT" });
    store.seedRecipe(RECIPE);

    expect(await refusal({ output: 1_500 }, store)).toEqual({ kind: "invalid_output" });
  });
});

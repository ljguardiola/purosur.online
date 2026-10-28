import { describe, expect, it } from "vitest";
import {
  type RegisterAssemblyBatchInput,
  registerAssemblyBatch,
} from "./register-assembly-batch.js";
import {
  assemblyBatchInput,
  BAG,
  BRANCH,
  MIX,
  NUTS,
  storeWithRecipe,
} from "./test-support/assembly-batch-scenario.js";
import { type FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";
import { type VoidAssemblyBatchOutcome, voidAssemblyBatch } from "./void-assembly-batch.js";

const ASSEMBLED_AT = new Date("2026-05-04T13:00:00.000Z");
const VOIDED_AT = new Date("2026-05-04T15:30:00.000Z");

async function storeWithBatch(
  options: { nutsInLots?: boolean; overrides?: Partial<RegisterAssemblyBatchInput> } = {},
): Promise<FakeStockStore> {
  const store = storeWithRecipe({ nutsInLots: options.nutsInLots ?? true });
  const outcome = await registerAssemblyBatch(
    { store, clock: new FixedClock(ASSEMBLED_AT) },
    assemblyBatchInput(options.overrides),
  );
  expect(outcome.kind).toBe("recorded");
  return store;
}

function voidBatch(
  store: FakeStockStore,
  overrides: { batchId?: string; locationId?: string; actorId?: string } = {},
): Promise<VoidAssemblyBatchOutcome> {
  return voidAssemblyBatch(
    { store, clock: new FixedClock(VOIDED_AT) },
    { batchId: "batch-1", locationId: BRANCH, actorId: "person-2", ...overrides },
  );
}

function remainingByLot(store: FakeStockStore): Record<string, number> {
  return Object.fromEntries(store.snapshot().lots.map((lot) => [lot.id, lot.remaining]));
}

function consumeBatchLot(store: FakeStockStore, kind: "sale" | "loss"): void {
  const lot = store.snapshot().lots.find((row) => row.assemblyBatchId === "batch-1");
  const movementId = store.seedMovement({
    ...MIX,
    kind,
    reason: null,
    delta: -1_000,
    occurredAt: new Date("2026-05-04T14:00:00.000Z"),
    actorId: "person-3",
    supersededByCountId: null,
  });
  store.seedAllocation({ movementId, lotId: lot?.id ?? "", quantity: -1_000 });
}

describe("voidAssemblyBatch", () => {
  it("gives back to each component lot exactly what the batch took from it, however many lots that was", async () => {
    const store = await storeWithBatch();

    const outcome = await voidBatch(store);

    expect(outcome.kind).toBe("voided");
    expect(remainingByLot(store)).toMatchObject({
      "nuts-soon": 5_000,
      "nuts-late": 10_000,
      "bag-lot": 50_000,
    });
  });

  it("gives back what a shortfall left on a technical lot to that same lot", async () => {
    const store = await storeWithBatch({
      nutsInLots: false,
      overrides: {
        used: [
          { componentProductId: NUTS.productId, quantity: 17_000 },
          { componentProductId: BAG.productId, quantity: 2_000 },
        ],
        output: 19_000,
      },
    });
    const technical = store.snapshot().lots.find((lot) => lot.technical);
    expect(technical?.remaining).toBe(-17_000);

    await voidBatch(store);

    expect(store.snapshot().lots.find((lot) => lot.technical)?.remaining).toBe(0);
  });

  it("subtracts the output and leaves the batch's own lot at zero", async () => {
    const store = await storeWithBatch();

    await voidBatch(store);

    const batchLot = store.snapshot().lots.find((lot) => lot.assemblyBatchId === "batch-1");
    expect(batchLot?.remaining).toBe(0);
    expect(store.balanceOf(MIX)).toBe(0);
  });

  it("returns the debt the output had covered on the lots that were in debt", async () => {
    const store = storeWithRecipe();
    store.seedLot({ id: "mix-debt", ...MIX, remaining: -3_000 });
    store.seedBalance({ ...MIX, quantity: -3_000 });
    await registerAssemblyBatch(
      { store, clock: new FixedClock(ASSEMBLED_AT) },
      assemblyBatchInput(),
    );

    await voidBatch(store);

    const lots = store.snapshot().lots;
    expect(lots.find((lot) => lot.id === "mix-debt")?.remaining).toBe(-3_000);
    expect(lots.find((lot) => lot.assemblyBatchId === "batch-1")?.remaining).toBe(0);
    expect(store.balanceOf(MIX)).toBe(-3_000);
  });

  it("returns the balances of the components and of the assembled product to what they were before the batch", async () => {
    const store = await storeWithBatch();

    await voidBatch(store);

    expect(store.balanceOf(NUTS)).toBe(15_000);
    expect(store.balanceOf(BAG)).toBe(50_000);
    expect(store.balanceOf(MIX)).toBe(0);
  });

  it("records one void movement per product the batch moved, linked to it, adding back to each component and subtracting from the output", async () => {
    const store = await storeWithBatch();

    await voidBatch(store);

    const voidMovements = store
      .snapshot()
      .movements.filter((movement) => movement.kind === "assembly_void")
      .map((movement) => ({
        productId: movement.productId,
        locationId: movement.locationId,
        reason: movement.reason,
        delta: movement.delta,
        occurredAt: movement.occurredAt,
        actorId: movement.actorId,
        assemblyBatchId: movement.assemblyBatchId,
        supersededByCountId: movement.supersededByCountId,
      }));
    const common = {
      locationId: BRANCH,
      reason: null,
      occurredAt: VOIDED_AT,
      actorId: "person-2",
      assemblyBatchId: "batch-1",
      supersededByCountId: null,
    };
    expect(voidMovements).toEqual([
      { ...common, productId: BAG.productId, delta: 2_000 },
      { ...common, productId: MIX.productId, delta: -14_000 },
      { ...common, productId: NUTS.productId, delta: 12_000 },
    ]);
  });

  it("records no void movement for a product whose batch movement a later count had superseded", async () => {
    const store = storeWithRecipe();
    store.seedMovement({
      ...NUTS,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: new Date("2026-05-04T14:00:00.000Z"),
      actorId: "person-2",
      supersededByCountId: null,
    });
    await registerAssemblyBatch(
      { store, clock: new FixedClock(ASSEMBLED_AT) },
      assemblyBatchInput(),
    );

    await voidBatch(store);

    const voided = store
      .snapshot()
      .movements.filter((movement) => movement.kind === "assembly_void");
    expect(voided.map((movement) => movement.productId)).toEqual([BAG.productId, MIX.productId]);
  });

  it("answers the batch with the moment it was voided", async () => {
    const store = await storeWithBatch();

    const outcome = await voidBatch(store);

    expect(outcome).toEqual({ kind: "voided", batch: { id: "batch-1", voidedAt: VOIDED_AT } });
  });

  it("keeps who voided the batch and when", async () => {
    const store = await storeWithBatch();

    await voidBatch(store, { actorId: "person-9" });

    expect(store.snapshot().batches[0]).toMatchObject({
      voidedAt: VOIDED_AT,
      voidedBy: "person-9",
    });
  });

  it.each(["sale", "loss"] as const)(
    "refuses a batch whose lot already had a %s, writing nothing",
    async (kind) => {
      const store = await storeWithBatch();
      consumeBatchLot(store, kind);
      const before = store.snapshot();

      const outcome = await voidBatch(store);

      expect(outcome).toEqual({ kind: "consumed" });
      expect(store.snapshot()).toEqual(before);
    },
  );

  it.each(["recordMovement", "allocateToLot", "addToBalance", "recordAssemblyBatchVoid"] as const)(
    "leaves the batch, the movements, the lots and the balances as they were when %s fails",
    async (operation) => {
      const store = await storeWithBatch();
      const before = store.snapshot();
      store.failingWrites.add(operation);

      await expect(voidBatch(store)).rejects.toThrow(`${operation} failed`);

      expect(store.snapshot()).toEqual(before);
    },
  );

  it("refuses a batch already voided, writing nothing", async () => {
    const store = await storeWithBatch();
    await voidBatch(store);
    const before = store.snapshot();

    const outcome = await voidBatch(store, { actorId: "person-9" });

    expect(outcome).toEqual({ kind: "already_voided" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not found for a batch that does not exist, writing nothing", async () => {
    const store = await storeWithBatch();
    const before = store.snapshot();

    const outcome = await voidBatch(store, { batchId: "batch-404" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("answers not found for a batch of another location, writing nothing", async () => {
    const store = await storeWithBatch();
    const before = store.snapshot();

    const outcome = await voidBatch(store, { locationId: "branch-2" });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("locks the batch first and then its products in sorted order, and checks consumption only after those locks", async () => {
    const store = await storeWithBatch();
    store.operationOrder = [];
    store.lockedProducts = [];

    await voidBatch(store);

    const locks = store.operationOrder.filter((operation) =>
      ["lockAssemblyBatch", "lockProductStock", "batchLotMovements"].includes(operation),
    );
    expect(locks).toEqual([
      "lockAssemblyBatch",
      "lockProductStock",
      "lockProductStock",
      "lockProductStock",
      "batchLotMovements",
    ]);
    expect(store.lockedProducts).toEqual([BAG.productId, MIX.productId, NUTS.productId]);
  });
});

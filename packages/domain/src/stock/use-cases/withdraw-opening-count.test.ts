import { describe, expect, it } from "vitest";
import { applyOpeningCount } from "./apply-opening-count.js";
import { applyRegisterStockMovements } from "./apply-register-stock-movements.js";
import { recordAdjustment } from "./record-adjustment.js";
import { FakeStockStore, FixedClock } from "./test-support/fake-stock-store.js";
import { type WithdrawOpeningCountInput, withdrawOpeningCount } from "./withdraw-opening-count.js";

const COUNTED_AT = new Date("2026-03-10T15:00:00.000Z");
const WITHDRAWN_AT = new Date("2026-03-10T16:00:00.000Z");
const BRANCH = "branch-1";
const YERBA = { productId: "product-yerba", locationId: BRANCH };

function withdrawal(overrides: Partial<WithdrawOpeningCountInput> = {}): WithdrawOpeningCountInput {
  return {
    locationId: BRANCH,
    occurredAt: WITHDRAWN_AT,
    actorId: "person-1",
    movementId: "withdrawal-a",
    withdrawnMovementId: "movement-a",
    ...overrides,
  };
}

async function count(
  store: FakeStockStore,
  movementId: string,
  counted: number,
  expiresOn: string | null = "2027-01-31",
) {
  await store.transaction((tx) =>
    applyOpeningCount(tx, {
      locationId: BRANCH,
      occurredAt: COUNTED_AT,
      actorId: "person-1",
      movementId,
      productId: "product-yerba",
      counted,
      expiresOn,
    }),
  );
}

async function sell(store: FakeStockStore, quantity: number) {
  await store.transaction((tx) =>
    applyRegisterStockMovements(tx, {
      locationId: BRANCH,
      occurredAt: new Date("2026-03-10T15:30:00.000Z"),
      actorId: "person-1",
      movements: [
        {
          id: `sale-${store.snapshot().movements.length}`,
          saleLineId: "sale-line-1",
          productId: "product-yerba",
          kind: "sale",
          delta: -quantity,
        },
      ],
    }),
  );
}

function withdraw(store: FakeStockStore, input: WithdrawOpeningCountInput) {
  return store.transaction((tx) => withdrawOpeningCount(tx, input));
}

async function storeWithLine(counted = 6_000): Promise<FakeStockStore> {
  const store = new FakeStockStore();
  store.seedProduct({ id: "product-yerba", saleUnit: "UNIT" });
  await count(store, "movement-a", counted);
  return store;
}

function lotOf(store: FakeStockStore, movementId: string) {
  return store.snapshot().lots.find((lot) => lot.originMovementId === movementId);
}

describe("withdrawOpeningCount", () => {
  it("takes back everything the line added when its lot still holds all of it", async () => {
    const store = await storeWithLine();

    const outcome = await withdraw(store, withdrawal());

    expect(outcome).toEqual({
      kind: "withdrawn",
      taken: 6_000,
      notTaken: 0,
      supersededByCountId: null,
    });
    expect(store.balanceOf(YERBA)).toBe(0);
    expect(lotOf(store, "movement-a")).toMatchObject({ remaining: 0, withdrawn: true });
  });

  it("records the withdrawal as a movement under the register's own id, taking what was taken", async () => {
    const store = await storeWithLine();

    await withdraw(store, withdrawal());

    expect(store.snapshot().movements.find((movement) => movement.id === "withdrawal-a")).toEqual({
      id: "withdrawal-a",
      ...YERBA,
      kind: "opening_count_withdrawal",
      reason: null,
      delta: -6_000,
      occurredAt: WITHDRAWN_AT,
      actorId: "person-1",
      supersededByCountId: null,
    });
  });

  it("takes only what the lot still holds when part of it was already sold, and reports what it could not take", async () => {
    const store = await storeWithLine();
    await sell(store, 4_000);

    const outcome = await withdraw(store, withdrawal());

    expect(outcome).toMatchObject({ kind: "withdrawn", taken: 2_000, notTaken: 4_000 });
    expect(store.balanceOf(YERBA)).toBe(0);
    expect(lotOf(store, "movement-a")).toMatchObject({ remaining: 0, withdrawn: true });
  });

  it("never takes more than the line added, keeping the excess a later count found in its lot", async () => {
    const store = await storeWithLine();
    await recordAdjustment(
      { store, clock: new FixedClock(new Date("2026-03-10T15:45:00.000Z")) },
      {
        ...YERBA,
        reason: "batch_correction",
        direction: "add",
        quantity: 3_000,
        actorId: "person-2",
      },
    );

    const outcome = await withdraw(store, withdrawal());

    expect(outcome).toMatchObject({ kind: "withdrawn", taken: 6_000, notTaken: 0 });
    expect(lotOf(store, "movement-a")).toMatchObject({ remaining: 3_000, withdrawn: true });
    expect(store.balanceOf(YERBA)).toBe(3_000);
  });

  it("takes nothing from a lot already in debt, never leaving it negative, and records no movement", async () => {
    const store = await storeWithLine();
    await sell(store, 7_000);

    const outcome = await withdraw(store, withdrawal());

    expect(outcome).toMatchObject({ kind: "withdrawn", taken: 0, notTaken: 6_000 });
    expect(lotOf(store, "movement-a")).toMatchObject({ remaining: -1_000, withdrawn: true });
    expect(store.balanceOf(YERBA)).toBe(-1_000);
    expect(store.snapshot().movements.some((movement) => movement.id === "withdrawal-a")).toBe(
      false,
    );
  });

  it("takes from the withdrawn line's own lot only, not from the lot that expires first", async () => {
    const store = await storeWithLine();
    await count(store, "movement-b", 5_000, "2026-12-31");

    await withdraw(store, withdrawal());

    expect(lotOf(store, "movement-a")).toMatchObject({ remaining: 0, withdrawn: true });
    expect(lotOf(store, "movement-b")).toMatchObject({ remaining: 5_000, withdrawn: false });
    expect(store.balanceOf(YERBA)).toBe(5_000);
    expect(store.snapshot().allocations.filter((row) => row.movementId === "withdrawal-a")).toEqual(
      [{ movementId: "withdrawal-a", lotId: "lot-1", quantity: -6_000 }],
    );
  });

  it("takes from the lot of the line withdrawn when the product has other lots with less in them", async () => {
    const store = await storeWithLine(3_000);
    await count(store, "movement-b", 6_000, "2026-12-31");

    const outcome = await withdraw(store, withdrawal({ withdrawnMovementId: "movement-b" }));

    expect(outcome).toMatchObject({ kind: "withdrawn", taken: 6_000, notTaken: 0 });
    expect(lotOf(store, "movement-a")).toMatchObject({ remaining: 3_000, withdrawn: false });
    expect(lotOf(store, "movement-b")).toMatchObject({ remaining: 0, withdrawn: true });
  });

  it("says not found for a movement that is no opening count", async () => {
    const store = await storeWithLine();
    const before = store.snapshot();

    const outcome = await withdraw(store, withdrawal({ withdrawnMovementId: "movement-ghost" }));

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("says not found for an opening count of another branch", async () => {
    const store = await storeWithLine();
    const before = store.snapshot();

    const outcome = await withdraw(store, withdrawal({ locationId: "branch-2" }));

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
  });

  it("changes nothing when the line was already withdrawn", async () => {
    const store = await storeWithLine();
    await withdraw(store, withdrawal());
    const before = store.snapshot();

    const outcome = await withdraw(store, withdrawal({ movementId: "withdrawal-b" }));

    expect(outcome).toEqual({ kind: "already_withdrawn" });
    expect(store.snapshot()).toEqual(before);
  });

  it("changes nothing when the same withdrawal arrives again", async () => {
    const store = await storeWithLine();
    await withdraw(store, withdrawal());
    const before = store.snapshot();

    const outcome = await withdraw(store, withdrawal());

    expect(outcome).toEqual({ kind: "already_withdrawn" });
    expect(store.snapshot()).toEqual(before);
  });

  it("is superseded by a count dated after it: the movement is kept but the balance and the lot do not move", async () => {
    const store = await storeWithLine();
    const countId = store.seedMovement({
      ...YERBA,
      kind: "count",
      reason: null,
      delta: 0,
      occurredAt: new Date("2026-03-11T10:00:00.000Z"),
      actorId: "person-2",
      supersededByCountId: null,
    });

    const outcome = await withdraw(store, withdrawal());

    expect(outcome).toMatchObject({ kind: "withdrawn", supersededByCountId: countId });
    expect(
      store.snapshot().movements.find((movement) => movement.id === "withdrawal-a"),
    ).toMatchObject({ delta: -6_000, supersededByCountId: countId });
    expect(store.balanceOf(YERBA)).toBe(6_000);
    expect(lotOf(store, "movement-a")).toMatchObject({ remaining: 6_000, withdrawn: true });
  });

  it("locks the product's stock before reading the lot it takes from", async () => {
    const store = await storeWithLine();
    store.operationOrder.length = 0;

    await withdraw(store, withdrawal());

    expect(store.operationOrder.indexOf("lockProductStock")).toBeLessThan(
      store.operationOrder.indexOf("productLots"),
    );
  });

  it("leaves nothing behind when a write fails", async () => {
    const store = await storeWithLine();
    store.failingWrites.add("markOpeningCountWithdrawn");
    const before = store.snapshot();

    await expect(withdraw(store, withdrawal())).rejects.toThrow("markOpeningCountWithdrawn failed");

    expect(store.snapshot()).toEqual(before);
  });
});

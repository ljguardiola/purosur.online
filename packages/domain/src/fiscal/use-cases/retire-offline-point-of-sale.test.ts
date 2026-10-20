import { describe, expect, it } from "vitest";
import { retireOfflinePointOfSale } from "./retire-offline-point-of-sale.js";
import { FakeRegisterPointOfSaleStore } from "./test-support/fake-register-point-of-sale-store.js";
import { FixedClock } from "./test-support/fixed-clock.js";

const BRANCH = "branch-1";
const ACTOR = "user-1";
const NOW = new Date("2026-10-20T15:00:00.000Z");

function storeWithOfflinePointsOfSale(): FakeRegisterPointOfSaleStore {
  const store = new FakeRegisterPointOfSaleStore();
  store.seedRegister({ id: "register-1", locationId: BRANCH, name: "Caja 1" });
  store.seedRegister({ id: "register-2", locationId: BRANCH, name: "Caja 2" });
  store.seedRegister({ id: "register-3", locationId: "branch-2", name: "Caja 3" });
  store.seedPointOfSaleClaim({
    pointOfSaleNumber: 12,
    registerId: "register-1",
    mechanism: "offline",
  });
  store.seedPointOfSaleClaim({
    pointOfSaleNumber: 13,
    registerId: "register-1",
    mechanism: "offline",
  });
  store.seedRegisterOfflinePointOfSale({
    registerId: "register-1",
    pointOfSaleNumber: 13,
    version: 2,
  });
  store.seedPointOfSaleClaim({
    pointOfSaleNumber: 14,
    registerId: "register-2",
    mechanism: "real_time",
  });
  store.seedPointOfSaleClaim({
    pointOfSaleNumber: 15,
    registerId: "register-3",
    mechanism: "offline",
  });
  return store;
}

function retire(store: FakeRegisterPointOfSaleStore, overrides: Record<string, unknown> = {}) {
  return retireOfflinePointOfSale(
    { store: store.retirement, clock: new FixedClock(NOW) },
    { locationId: BRANCH, pointOfSaleNumber: 12, actorId: ACTOR, ...overrides },
  );
}

describe("retireOfflinePointOfSale", () => {
  it("retires an offline point of sale no register has assigned any more, at the moment it was asked and recording who did it", async () => {
    const store = storeWithOfflinePointsOfSale();

    const outcome = await retire(store);

    expect(outcome).toEqual({ kind: "retired", retiredAt: NOW });
    expect(store.snapshot().pointOfSaleRetirements).toEqual([
      { pointOfSaleNumber: 12, retiredAt: NOW, recordedBy: ACTOR },
    ]);
  });

  it("changes nothing else", async () => {
    const store = storeWithOfflinePointsOfSale();
    const before = store.snapshot();

    await retire(store);

    expect({ ...store.snapshot(), pointOfSaleRetirements: [] }).toEqual(before);
  });

  it("locks the number first, then reads its claim, then checks the assignment, and writes last, in one transaction", async () => {
    const store = storeWithOfflinePointsOfSale();

    await retire(store);

    expect(store.operationOrder).toEqual([
      "lockPointOfSale",
      "branchPointOfSaleClaim",
      "offlineRegisterOf",
      "retirePointOfSale",
    ]);
    expect(store.lockedPointsOfSale).toEqual([12]);
    expect(store.transactionCount).toBe(1);
  });

  it("refuses the offline point of sale a register still has assigned, changing nothing", async () => {
    const store = storeWithOfflinePointsOfSale();
    const before = store.snapshot();

    const outcome = await retire(store, { pointOfSaleNumber: 13 });

    expect(outcome).toEqual({ kind: "assigned" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).not.toContain("retirePointOfSale");
  });

  it("refuses a point of sale that is already retired, keeping the first retirement", async () => {
    const store = storeWithOfflinePointsOfSale();
    const firstRetirement = { pointOfSaleNumber: 12, retiredAt: new Date("2026-09-20T12:00:00.000Z") };
    store.seedPointOfSaleRetirement(firstRetirement);
    const before = store.snapshot();

    const outcome = await retire(store);

    expect(outcome).toEqual({ kind: "already_retired" });
    expect(store.snapshot()).toEqual(before);
  });

  it.each([
    ["nobody claimed", 99],
    ["a register holds as its real-time point of sale", 14],
    ["another branch's register claimed", 15],
  ])("refuses a number %s as not found, changing nothing", async (_case, pointOfSaleNumber) => {
    const store = storeWithOfflinePointsOfSale();
    const before = store.snapshot();

    const outcome = await retire(store, { pointOfSaleNumber });

    expect(outcome).toEqual({ kind: "not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockPointOfSale", "branchPointOfSaleClaim"]);
  });

  it("leaves nothing behind when recording the retirement fails, and lets the error through", async () => {
    const store = storeWithOfflinePointsOfSale();
    store.failingWrites.add("retirePointOfSale");
    const before = store.snapshot();

    await expect(retire(store)).rejects.toThrow("retirePointOfSale failed");

    expect(store.snapshot()).toEqual(before);
  });
});

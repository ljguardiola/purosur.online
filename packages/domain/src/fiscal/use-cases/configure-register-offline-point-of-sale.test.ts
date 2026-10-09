import { describe, expect, it } from "vitest";
import { configureRegisterOfflinePointOfSale } from "./configure-register-offline-point-of-sale.js";
import { FakeRegisterPointOfSaleStore } from "./test-support/fake-register-point-of-sale-store.js";

const BRANCH = "branch-1";
const ACTOR = "user-1";

function storeWithRegisters(): FakeRegisterPointOfSaleStore {
  const store = new FakeRegisterPointOfSaleStore();
  store.seedRegister({ id: "register-1", locationId: BRANCH, name: "Caja 1" });
  store.seedRegister({ id: "register-2", locationId: BRANCH, name: "Caja 2" });
  store.seedRegister({ id: "register-3", locationId: "branch-2", name: "Caja 1" });
  for (const [registerId, pointOfSaleNumber] of [
    ["register-1", 5],
    ["register-2", 6],
    ["register-3", 7],
  ] as const) {
    store.seedRegisterPointOfSale({
      registerId,
      pointOfSaleNumber,
      fiscalAddressId: "address-1",
      version: 1,
    });
    store.seedPointOfSaleClaim({ pointOfSaleNumber, registerId, mechanism: "real_time" });
  }
  return store;
}

function configure(store: FakeRegisterPointOfSaleStore, overrides: Record<string, unknown> = {}) {
  return configureRegisterOfflinePointOfSale(store.offline, {
    locationId: BRANCH,
    registerId: "register-1",
    pointOfSaleNumber: 12,
    version: 0,
    actorId: ACTOR,
    ...overrides,
  });
}

describe("configureRegisterOfflinePointOfSale", () => {
  it("gives a register its offline point of sale at version 1, claiming the number as offline and recording who did it", async () => {
    const store = storeWithRegisters();

    const outcome = await configure(store);

    expect(outcome).toEqual({
      kind: "configured",
      setup: { pointOfSaleNumber: 12, version: 1 },
    });
    const state = store.snapshot();
    expect(state.registerOfflinePointsOfSale).toEqual([
      { registerId: "register-1", pointOfSaleNumber: 12, version: 1, recordedBy: ACTOR },
    ]);
    expect(state.pointOfSaleClaims).toContainEqual({
      pointOfSaleNumber: 12,
      registerId: "register-1",
      mechanism: "offline",
    });
  });

  it("leaves the real-time point of sale of the register as it was", async () => {
    const store = storeWithRegisters();
    const before = store.snapshot().registerPointsOfSale;

    await configure(store);

    expect(store.snapshot().registerPointsOfSale).toEqual(before);
  });

  it("locks the register, its real-time setup, its offline setup and the number's claim, in that order, before it writes, in one transaction", async () => {
    const store = storeWithRegisters();

    await configure(store);

    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointOfSale",
      "lockRegisterOfflinePointOfSale",
      "lockPointOfSaleClaim",
      "claimPointOfSale",
      "recordRegisterOfflinePointOfSale",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it.each([
    ["does not exist", "missing"],
    ["belongs to another branch", "register-3"],
  ])("refuses a register that %s, writing nothing", async (_case, registerId) => {
    const store = storeWithRegisters();
    const before = store.snapshot();

    const outcome = await configure(store, { registerId });

    expect(outcome).toEqual({ kind: "register_not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister"]);
  });

  it("refuses a register that has no real-time point of sale yet, writing nothing", async () => {
    const store = new FakeRegisterPointOfSaleStore();
    store.seedRegister({ id: "register-1", locationId: BRANCH, name: "Caja 1" });
    const before = store.snapshot();

    const outcome = await configure(store);

    expect(outcome).toEqual({ kind: "real_time_point_of_sale_missing" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister", "lockRegisterPointOfSale"]);
  });

  it("refuses a setup made from a version other than the current one", async () => {
    const store = storeWithRegisters();
    store.seedRegisterOfflinePointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 12,
      version: 2,
    });
    store.seedPointOfSaleClaim({
      pointOfSaleNumber: 12,
      registerId: "register-1",
      mechanism: "offline",
    });
    const before = store.snapshot();

    const outcome = await configure(store, { pointOfSaleNumber: 13, version: 1 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointOfSale",
      "lockRegisterOfflinePointOfSale",
    ]);
  });

  it("refuses a first setup made from any version but 0", async () => {
    const store = storeWithRegisters();

    const outcome = await configure(store, { version: 1 });

    expect(outcome).toEqual({ kind: "stale_version" });
  });

  it("records nothing when the register already has that offline number", async () => {
    const store = storeWithRegisters();
    store.seedRegisterOfflinePointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 12,
      version: 2,
    });
    store.seedPointOfSaleClaim({
      pointOfSaleNumber: 12,
      registerId: "register-1",
      mechanism: "offline",
    });
    const before = store.snapshot();

    const outcome = await configure(store, { version: 2 });

    expect(outcome).toEqual({
      kind: "unchanged",
      setup: { pointOfSaleNumber: 12, version: 2 },
    });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointOfSale",
      "lockRegisterOfflinePointOfSale",
    ]);
  });

  it("refuses a number another register holds as an offline point of sale, writing nothing", async () => {
    const store = storeWithRegisters();
    store.seedRegisterOfflinePointOfSale({
      registerId: "register-2",
      pointOfSaleNumber: 12,
      version: 1,
    });
    store.seedPointOfSaleClaim({
      pointOfSaleNumber: 12,
      registerId: "register-2",
      mechanism: "offline",
    });
    const before = store.snapshot();

    const outcome = await configure(store);

    expect(outcome).toEqual({ kind: "point_of_sale_taken" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointOfSale",
      "lockRegisterOfflinePointOfSale",
      "lockPointOfSaleClaim",
    ]);
  });

  it.each([
    ["another register", 6],
    ["the same register", 5],
  ])("refuses a number held as the real-time point of sale of %s", async (_case, number) => {
    const store = storeWithRegisters();
    const before = store.snapshot();

    const outcome = await configure(store, { pointOfSaleNumber: number });

    expect(outcome).toEqual({ kind: "point_of_sale_taken" });
    expect(store.snapshot()).toEqual(before);
  });

  it("refuses a number another register held as offline before moving to a different one", async () => {
    const store = storeWithRegisters();
    store.seedRegisterOfflinePointOfSale({
      registerId: "register-2",
      pointOfSaleNumber: 13,
      version: 2,
    });
    store.seedPointOfSaleClaim({
      pointOfSaleNumber: 12,
      registerId: "register-2",
      mechanism: "offline",
    });

    const outcome = await configure(store);

    expect(outcome).toEqual({ kind: "point_of_sale_taken" });
  });

  it("lets a register take back an offline number it held before, without claiming it again", async () => {
    const store = storeWithRegisters();
    store.seedRegisterOfflinePointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 13,
      version: 2,
    });
    for (const pointOfSaleNumber of [12, 13]) {
      store.seedPointOfSaleClaim({
        pointOfSaleNumber,
        registerId: "register-1",
        mechanism: "offline",
      });
    }

    const outcome = await configure(store, { version: 2 });

    expect(outcome).toEqual({ kind: "configured", setup: { pointOfSaleNumber: 12, version: 3 } });
    expect(store.operationOrder).not.toContain("claimPointOfSale");
    expect(store.snapshot().pointOfSaleClaims).toHaveLength(7);
  });

  it("keeps the number a register leaves claimed for it when it moves to a new one", async () => {
    const store = storeWithRegisters();
    store.seedRegisterOfflinePointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 12,
      version: 1,
    });
    store.seedPointOfSaleClaim({
      pointOfSaleNumber: 12,
      registerId: "register-1",
      mechanism: "offline",
    });

    const outcome = await configure(store, { pointOfSaleNumber: 14, version: 1 });

    expect(outcome).toEqual({ kind: "configured", setup: { pointOfSaleNumber: 14, version: 2 } });
    const claims = store.snapshot().pointOfSaleClaims;
    expect(claims).toContainEqual({
      pointOfSaleNumber: 12,
      registerId: "register-1",
      mechanism: "offline",
    });
    expect(claims).toContainEqual({
      pointOfSaleNumber: 14,
      registerId: "register-1",
      mechanism: "offline",
    });
  });

  it("answers point_of_sale_taken when it loses the number to a concurrent claim, leaving nothing behind", async () => {
    const store = storeWithRegisters();
    store.pointOfSaleClaimConflicts.add(12);
    const before = store.snapshot();

    const outcome = await configure(store);

    expect(outcome).toEqual({ kind: "point_of_sale_taken" });
    expect(store.snapshot()).toEqual(before);
  });

  it("leaves no claim behind when recording the setup fails, and lets the error through", async () => {
    const store = storeWithRegisters();
    store.failingWrites.add("recordRegisterOfflinePointOfSale");
    const before = store.snapshot();

    await expect(configure(store)).rejects.toThrow("recordRegisterOfflinePointOfSale failed");

    expect(store.snapshot()).toEqual(before);
  });

  it("lets a failure of the claim itself through, writing nothing", async () => {
    const store = storeWithRegisters();
    store.failingWrites.add("claimPointOfSale");
    const before = store.snapshot();

    await expect(configure(store)).rejects.toThrow("claimPointOfSale failed");

    expect(store.snapshot()).toEqual(before);
  });
});

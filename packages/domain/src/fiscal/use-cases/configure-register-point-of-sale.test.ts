import { describe, expect, it } from "vitest";
import { configureRegisterPointOfSale } from "./configure-register-point-of-sale.js";
import { FakeRegisterPointOfSaleStore } from "./test-support/fake-register-point-of-sale-store.js";

const BRANCH = "branch-1";
const ACTOR = "user-1";

function storeWithRegisters(): FakeRegisterPointOfSaleStore {
  const store = new FakeRegisterPointOfSaleStore();
  store.seedRegister({ id: "register-1", locationId: BRANCH, name: "Caja 1" });
  store.seedRegister({ id: "register-2", locationId: BRANCH, name: "Caja 2" });
  store.seedRegister({ id: "register-3", locationId: "branch-2", name: "Caja 1" });
  store.seedFiscalAddress("address-1");
  store.seedFiscalAddress("address-2");
  return store;
}

function configure(store: FakeRegisterPointOfSaleStore, overrides: Record<string, unknown> = {}) {
  return configureRegisterPointOfSale(store, {
    locationId: BRANCH,
    registerId: "register-1",
    pointOfSaleNumber: 12,
    fiscalAddressId: "address-1",
    version: 0,
    actorId: ACTOR,
    ...overrides,
  });
}

describe("configureRegisterPointOfSale", () => {
  it("gives a register that was never configured its point of sale and fiscal address at version 1, claiming the number and recording who did it", async () => {
    const store = storeWithRegisters();

    const outcome = await configure(store);

    expect(outcome).toEqual({
      kind: "configured",
      setup: { pointOfSaleNumber: 12, fiscalAddressId: "address-1", version: 1 },
    });
    const state = store.snapshot();
    expect(state.registerPointsOfSale).toEqual([
      {
        registerId: "register-1",
        pointOfSaleNumber: 12,
        fiscalAddressId: "address-1",
        version: 1,
        recordedBy: ACTOR,
      },
    ]);
    expect(state.pointOfSaleClaims).toEqual([{ pointOfSaleNumber: 12, registerId: "register-1" }]);
  });

  it("locks the register, its setup, the fiscal address and the number's claim, in that order, before it writes, in one transaction", async () => {
    const store = storeWithRegisters();

    await configure(store);

    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointOfSale",
      "fiscalAddressExists",
      "lockPointOfSaleClaim",
      "claimPointOfSale",
      "recordRegisterPointOfSale",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it.each([
    ["does not exist", "missing", BRANCH],
    ["belongs to another branch", "register-3", BRANCH],
  ])("refuses a register that %s, writing nothing", async (_case, registerId, locationId) => {
    const store = storeWithRegisters();
    const before = store.snapshot();

    const outcome = await configure(store, { registerId, locationId });

    expect(outcome).toEqual({ kind: "register_not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister"]);
  });

  it("refuses a setup made from a version other than the register's current one", async () => {
    const store = storeWithRegisters();
    store.seedRegisterPointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 12,
      fiscalAddressId: "address-1",
      version: 2,
    });
    const before = store.snapshot();

    const outcome = await configure(store, { pointOfSaleNumber: 13, version: 1 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister", "lockRegisterPointOfSale"]);
  });

  it("refuses a first setup made from any version but 0", async () => {
    const store = storeWithRegisters();

    const outcome = await configure(store, { version: 1 });

    expect(outcome).toEqual({ kind: "stale_version" });
  });

  it("refuses a fiscal address that does not exist, claiming nothing", async () => {
    const store = storeWithRegisters();
    const before = store.snapshot();

    const outcome = await configure(store, { fiscalAddressId: "missing" });

    expect(outcome).toEqual({ kind: "fiscal_address_not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointOfSale",
      "fiscalAddressExists",
    ]);
  });

  it("refuses a number another register holds, writing nothing", async () => {
    const store = storeWithRegisters();
    store.seedRegisterPointOfSale({
      registerId: "register-2",
      pointOfSaleNumber: 12,
      fiscalAddressId: "address-2",
      version: 1,
    });
    store.seedPointOfSaleClaim({ pointOfSaleNumber: 12, registerId: "register-2" });
    const before = store.snapshot();

    const outcome = await configure(store);

    expect(outcome).toEqual({ kind: "point_of_sale_taken" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterPointOfSale",
      "fiscalAddressExists",
      "lockPointOfSaleClaim",
    ]);
  });

  it("refuses a number another register held before moving to a different one", async () => {
    const store = storeWithRegisters();
    store.seedRegisterPointOfSale({
      registerId: "register-2",
      pointOfSaleNumber: 13,
      fiscalAddressId: "address-2",
      version: 2,
    });
    store.seedPointOfSaleClaim({ pointOfSaleNumber: 12, registerId: "register-2" });

    const outcome = await configure(store);

    expect(outcome).toEqual({ kind: "point_of_sale_taken" });
  });

  it("lets a register take back a number it held before, without claiming it again", async () => {
    const store = storeWithRegisters();
    store.seedRegisterPointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 13,
      fiscalAddressId: "address-1",
      version: 2,
    });
    store.seedPointOfSaleClaim({ pointOfSaleNumber: 12, registerId: "register-1" });
    store.seedPointOfSaleClaim({ pointOfSaleNumber: 13, registerId: "register-1" });

    const outcome = await configure(store, { version: 2 });

    expect(outcome).toEqual({
      kind: "configured",
      setup: { pointOfSaleNumber: 12, fiscalAddressId: "address-1", version: 3 },
    });
    expect(store.operationOrder).not.toContain("claimPointOfSale");
    expect(store.snapshot().pointOfSaleClaims).toHaveLength(2);
  });

  it("keeps the number a register leaves claimed for it when it moves to a new one", async () => {
    const store = storeWithRegisters();
    store.seedRegisterPointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 12,
      fiscalAddressId: "address-1",
      version: 1,
    });
    store.seedPointOfSaleClaim({ pointOfSaleNumber: 12, registerId: "register-1" });

    const outcome = await configure(store, { pointOfSaleNumber: 14, version: 1 });

    expect(outcome).toEqual({
      kind: "configured",
      setup: { pointOfSaleNumber: 14, fiscalAddressId: "address-1", version: 2 },
    });
    expect(store.snapshot().pointOfSaleClaims).toEqual([
      { pointOfSaleNumber: 12, registerId: "register-1" },
      { pointOfSaleNumber: 14, registerId: "register-1" },
    ]);
  });

  it("changes only the fiscal address of a register that keeps its number, claiming nothing", async () => {
    const store = storeWithRegisters();
    store.seedRegisterPointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 12,
      fiscalAddressId: "address-1",
      version: 1,
    });
    store.seedPointOfSaleClaim({ pointOfSaleNumber: 12, registerId: "register-1" });

    const outcome = await configure(store, { fiscalAddressId: "address-2", version: 1 });

    expect(outcome).toEqual({
      kind: "configured",
      setup: { pointOfSaleNumber: 12, fiscalAddressId: "address-2", version: 2 },
    });
    expect(store.operationOrder).not.toContain("claimPointOfSale");
  });

  it("records nothing when the register already has that number and fiscal address", async () => {
    const store = storeWithRegisters();
    store.seedRegisterPointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 12,
      fiscalAddressId: "address-1",
      version: 1,
    });
    const before = store.snapshot();

    const outcome = await configure(store, { version: 1 });

    expect(outcome).toEqual({
      kind: "unchanged",
      setup: { pointOfSaleNumber: 12, fiscalAddressId: "address-1", version: 1 },
    });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister", "lockRegisterPointOfSale"]);
  });

  it("lets two registers share a fiscal address, each with its own number", async () => {
    const store = storeWithRegisters();

    await configure(store);
    const outcome = await configure(store, { registerId: "register-2", pointOfSaleNumber: 13 });

    expect(outcome.kind).toBe("configured");
    expect(store.snapshot().registerPointsOfSale.map((row) => row.fiscalAddressId)).toEqual([
      "address-1",
      "address-1",
    ]);
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
    store.failingWrites.add("recordRegisterPointOfSale");
    const before = store.snapshot();

    await expect(configure(store)).rejects.toThrow("recordRegisterPointOfSale failed");

    expect(store.snapshot()).toEqual(before);
  });
});

describe("the points of sale of a branch's registers", () => {
  it("lists every register of the branch with its setup, or none yet", async () => {
    const store = storeWithRegisters();
    await configure(store);

    const overview = await store.listBranchRegisterPointsOfSale(BRANCH);

    expect(overview).toEqual([
      {
        registerId: "register-1",
        registerName: "Caja 1",
        pointOfSaleNumber: 12,
        fiscalAddressId: "address-1",
        version: 1,
      },
      {
        registerId: "register-2",
        registerName: "Caja 2",
        pointOfSaleNumber: null,
        fiscalAddressId: null,
        version: 0,
      },
    ]);
  });
});

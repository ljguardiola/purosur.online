import { describe, expect, it } from "vitest";
import { assignQrPointOfSale } from "./assign-qr-point-of-sale.js";
import { FakeQrPointOfSaleAssignmentStore } from "./test-support/fake-qr-point-of-sale-assignment-store.js";

const BRANCH = "branch-1";
const ACTOR = "user-1";
const EXTERNAL_POS_ID = "CAJA1_STORE_POS";
const OTHER_EXTERNAL_POS_ID = "CAJA2_STORE_POS";

function storeWithRegisters(): FakeQrPointOfSaleAssignmentStore {
  const store = new FakeQrPointOfSaleAssignmentStore();
  store.seedRegister({ id: "register-1", locationId: BRANCH });
  store.seedRegister({ id: "register-2", locationId: BRANCH });
  store.seedRegister({ id: "register-3", locationId: "branch-2" });
  return store;
}

function assign(store: FakeQrPointOfSaleAssignmentStore, overrides: Record<string, unknown> = {}) {
  return assignQrPointOfSale(store, {
    locationId: BRANCH,
    registerId: "register-1",
    externalPosId: EXTERNAL_POS_ID,
    version: 0,
    actorId: ACTOR,
    ...overrides,
  });
}

describe("assignQrPointOfSale", () => {
  it("gives a register that never had a QR point of sale its QR point of sale at version 1, recording who did it", async () => {
    const store = storeWithRegisters();

    const outcome = await assign(store);

    expect(outcome).toEqual({
      kind: "assigned",
      assignment: { externalPosId: EXTERNAL_POS_ID, version: 1 },
    });
    expect(store.snapshot().registerQrPointOfSales).toEqual([
      { registerId: "register-1", externalPosId: EXTERNAL_POS_ID, version: 1, recordedBy: ACTOR },
    ]);
  });

  it("locks the register, its assignment and the QR point of sale's holder, in that order, before it writes, in one transaction", async () => {
    const store = storeWithRegisters();

    await assign(store);

    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterQrPointOfSale",
      "lockQrPointOfSaleHolder",
      "recordQrPointOfSaleAssignment",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("keeps the external POS id without the whitespace around it", async () => {
    const store = storeWithRegisters();

    const outcome = await assign(store, { externalPosId: `  ${EXTERNAL_POS_ID}\n` });

    expect(outcome).toEqual({
      kind: "assigned",
      assignment: { externalPosId: EXTERNAL_POS_ID, version: 1 },
    });
  });

  it.each(["", "   ", "CAJA 1"])(
    "refuses the external POS id %j, touching no storage",
    async (externalPosId) => {
      const store = storeWithRegisters();

      const outcome = await assign(store, { externalPosId });

      expect(outcome).toEqual({ kind: "invalid_external_pos_id" });
      expect(store.operationOrder).toEqual([]);
      expect(store.transactionCount).toBe(0);
    },
  );

  it.each([
    ["does not exist", "missing"],
    ["belongs to another branch", "register-3"],
  ])("refuses a register that %s, writing nothing", async (_case, registerId) => {
    const store = storeWithRegisters();
    const before = store.snapshot();

    const outcome = await assign(store, { registerId });

    expect(outcome).toEqual({ kind: "register_not_found" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister"]);
  });

  it("refuses an assignment made from a version other than the register's current one", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", externalPosId: EXTERNAL_POS_ID, version: 2 });
    const before = store.snapshot();

    const outcome = await assign(store, { externalPosId: OTHER_EXTERNAL_POS_ID, version: 1 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister", "lockRegisterQrPointOfSale"]);
  });

  it("refuses a first assignment made from any version but 0", async () => {
    const store = storeWithRegisters();

    expect(await assign(store, { version: 1 })).toEqual({ kind: "stale_version" });
  });

  it("refuses a QR point of sale another register holds, writing nothing", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-2", externalPosId: EXTERNAL_POS_ID, version: 1 });
    const before = store.snapshot();

    const outcome = await assign(store);

    expect(outcome).toEqual({ kind: "qr_point_of_sale_taken" });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterQrPointOfSale",
      "lockQrPointOfSaleHolder",
    ]);
  });

  it("answers qr_point_of_sale_taken when it loses the QR point of sale to a concurrent assignment, leaving nothing behind", async () => {
    const store = storeWithRegisters();
    store.pointsOfSaleLostToRace.add(EXTERNAL_POS_ID);
    const before = store.snapshot();

    const outcome = await assign(store);

    expect(outcome).toEqual({ kind: "qr_point_of_sale_taken" });
    expect(store.snapshot()).toEqual(before);
  });

  it("changes the QR point of sale of a register that had another one, bumping the version", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", externalPosId: EXTERNAL_POS_ID, version: 2 });

    const outcome = await assign(store, { externalPosId: OTHER_EXTERNAL_POS_ID, version: 2 });

    expect(outcome).toEqual({
      kind: "assigned",
      assignment: { externalPosId: OTHER_EXTERNAL_POS_ID, version: 3 },
    });
  });

  it("lets a register take back a QR point of sale it held before another one", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", externalPosId: null, version: 3 });

    const outcome = await assign(store, { version: 3 });

    expect(outcome).toEqual({
      kind: "assigned",
      assignment: { externalPosId: EXTERNAL_POS_ID, version: 4 },
    });
  });

  it("clears the QR point of sale of a register, bumping the version, without asking who holds one", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", externalPosId: EXTERNAL_POS_ID, version: 1 });

    const outcome = await assign(store, { externalPosId: null, version: 1 });

    expect(outcome).toEqual({ kind: "assigned", assignment: { externalPosId: null, version: 2 } });
    expect(store.operationOrder).toEqual([
      "lockBranchRegister",
      "lockRegisterQrPointOfSale",
      "recordQrPointOfSaleAssignment",
    ]);
    expect(store.snapshot().registerQrPointOfSales).toEqual([
      { registerId: "register-1", externalPosId: null, version: 2, recordedBy: ACTOR },
    ]);
  });

  it("frees a cleared QR point of sale for another register", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", externalPosId: EXTERNAL_POS_ID, version: 1 });
    await assign(store, { externalPosId: null, version: 1 });

    const outcome = await assign(store, { registerId: "register-2" });

    expect(outcome.kind).toBe("assigned");
  });

  it("records nothing when the register already has that QR point of sale", async () => {
    const store = storeWithRegisters();
    store.seedAssignment({ registerId: "register-1", externalPosId: EXTERNAL_POS_ID, version: 1 });
    const before = store.snapshot();

    const outcome = await assign(store, { version: 1 });

    expect(outcome).toEqual({
      kind: "unchanged",
      assignment: { externalPosId: EXTERNAL_POS_ID, version: 1 },
    });
    expect(store.snapshot()).toEqual(before);
    expect(store.operationOrder).toEqual(["lockBranchRegister", "lockRegisterQrPointOfSale"]);
  });

  it("records nothing when a register with no QR point of sale is cleared", async () => {
    const store = storeWithRegisters();

    const outcome = await assign(store, { externalPosId: null });

    expect(outcome).toEqual({ kind: "unchanged", assignment: { externalPosId: null, version: 0 } });
    expect(store.snapshot().registerQrPointOfSales).toEqual([]);
  });

  it("leaves nothing behind when recording fails, and lets the error through", async () => {
    const store = storeWithRegisters();
    store.failingWrites = true;
    const before = store.snapshot();

    await expect(assign(store)).rejects.toThrow("recordQrPointOfSaleAssignment failed");

    expect(store.snapshot()).toEqual(before);
  });
});

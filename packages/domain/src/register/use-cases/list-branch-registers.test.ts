import { describe, expect, it } from "vitest";
import { listBranchRegisters } from "./list-branch-registers.js";
import {
  FakeBranchRegisterStore,
  type FakeRegisterEnrollmentCode,
} from "./test-support/fake-branch-register-store.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-03-10T12:00:00.000Z");
const BRANCH = "branch-1";

function storeWithCaja1(): FakeBranchRegisterStore {
  const store = new FakeBranchRegisterStore();
  store.seedRegister({ id: "register-1", locationId: BRANCH, name: "Caja 1" });
  return store;
}

function codeOfCaja1(
  overrides: Partial<FakeRegisterEnrollmentCode> = {},
): FakeRegisterEnrollmentCode {
  return {
    registerId: "register-1",
    lookup: "ABCD",
    codeHash: "hash",
    issuedAt: new Date(NOW.getTime() - 60_000),
    expiresAt: new Date(NOW.getTime() + 14 * 60_000),
    redeemedAt: null,
    failedAttempts: 0,
    ...overrides,
  };
}

function listCaja1(store: FakeBranchRegisterStore) {
  return listBranchRegisters(
    { registers: store, clock: new FixedClock(NOW) },
    { locationId: BRANCH },
  );
}

describe("listBranchRegisters", () => {
  it("lists only the given branch's registers, in the order the store gives them", async () => {
    const store = new FakeBranchRegisterStore();
    store.seedRegister({ id: "register-1", locationId: BRANCH, name: "Caja 2" });
    store.seedRegister({ id: "register-2", locationId: "branch-2", name: "Caja 1" });
    store.seedRegister({ id: "register-3", locationId: BRANCH, name: "Caja 1" });

    const listed = await listBranchRegisters(
      { registers: store, clock: new FixedClock(NOW) },
      { locationId: BRANCH },
    );

    expect(listed).toEqual([
      { id: "register-1", name: "Caja 2", pendingCode: null, pointOfSaleNumber: null },
      { id: "register-3", name: "Caja 1", pendingCode: null, pointOfSaleNumber: null },
    ]);
  });

  it("reports a usable code as pending, with whole seconds since it was issued and until it expires", async () => {
    const store = storeWithCaja1();
    store.seedCode(
      codeOfCaja1({
        issuedAt: new Date(NOW.getTime() - 90_999),
        expiresAt: new Date(NOW.getTime() + 60_001),
      }),
    );

    const [caja1] = await listCaja1(store);

    expect(caja1?.pendingCode).toEqual({ secondsSinceIssued: 90, secondsUntilExpiry: 61 });
  });

  it("counts seconds exactly when the code was issued and expires on whole seconds", async () => {
    const store = storeWithCaja1();
    store.seedCode(
      codeOfCaja1({
        issuedAt: new Date(NOW.getTime() - 120_000),
        expiresAt: new Date(NOW.getTime() + 780_000),
      }),
    );

    const [caja1] = await listCaja1(store);

    expect(caja1?.pendingCode).toEqual({ secondsSinceIssued: 120, secondsUntilExpiry: 780 });
  });

  it("reports a code issued after the clock's current time as issued zero seconds ago", async () => {
    const store = storeWithCaja1();
    store.seedCode(codeOfCaja1({ issuedAt: new Date(NOW.getTime() + 5_000) }));

    const [caja1] = await listCaja1(store);

    expect(caja1?.pendingCode?.secondsSinceIssued).toBe(0);
  });

  it("reports a code expiring in less than a second as one second from expiring", async () => {
    const store = storeWithCaja1();
    store.seedCode(codeOfCaja1({ expiresAt: new Date(NOW.getTime() + 1) }));

    const [caja1] = await listCaja1(store);

    expect(caja1?.pendingCode?.secondsUntilExpiry).toBe(1);
  });

  it("reports no pending code for a register that never had one", async () => {
    const [caja1] = await listCaja1(storeWithCaja1());

    expect(caja1?.pendingCode).toBeNull();
  });

  it("reports no pending code once the code reaches its expiry", async () => {
    const store = storeWithCaja1();
    store.seedCode(codeOfCaja1({ expiresAt: NOW }));

    const [caja1] = await listCaja1(store);

    expect(caja1?.pendingCode).toBeNull();
  });

  it("reports no pending code once the code was redeemed", async () => {
    const store = storeWithCaja1();
    store.seedCode(codeOfCaja1({ redeemedAt: new Date(NOW.getTime() - 1_000) }));

    const [caja1] = await listCaja1(store);

    expect(caja1?.pendingCode).toBeNull();
  });

  it("reports no pending code once the code has used up its failed attempts", async () => {
    const store = storeWithCaja1();
    store.seedCode(codeOfCaja1({ failedAttempts: 5 }));

    const [caja1] = await listCaja1(store);

    expect(caja1?.pendingCode).toBeNull();
  });

  it("still reports a code with one failed attempt left as pending", async () => {
    const store = storeWithCaja1();
    store.seedCode(codeOfCaja1({ failedAttempts: 4 }));

    const [caja1] = await listCaja1(store);

    expect(caja1?.pendingCode).not.toBeNull();
  });

  it("reports the point of sale number a register was configured with", async () => {
    const store = storeWithCaja1();
    store.seedRegisterPointOfSale({
      registerId: "register-1",
      pointOfSaleNumber: 3,
      fiscalAddressId: "fiscal-address-1",
      version: 1,
    });

    const [caja1] = await listCaja1(store);

    expect(caja1?.pointOfSaleNumber).toBe(3);
  });

  it("reports no point of sale number for a register never configured", async () => {
    const [caja1] = await listCaja1(storeWithCaja1());

    expect(caja1?.pointOfSaleNumber).toBeNull();
  });
});

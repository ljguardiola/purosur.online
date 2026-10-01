import { describe, expect, it } from "vitest";
import { emitEnrollmentCode } from "./emit-enrollment-code.js";
import {
  FakeBranchRegisterStore,
  type FakeRegisterEnrollmentCode,
  SequentialEnrollmentCodes,
} from "./test-support/fake-branch-register-store.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-03-10T12:00:00.000Z");
const FIFTEEN_MINUTES_LATER = new Date("2026-03-10T12:15:00.000Z");
const ACTOR = "user-1";
const FIRST_CODE = "CODEAAAAAAAAAAA1";

function storeWithCaja1(): FakeBranchRegisterStore {
  const store = new FakeBranchRegisterStore();
  store.seedRegister({ id: "register-1", locationId: "branch-1", name: "Caja 1" });
  return store;
}

function previousCode(
  overrides: Partial<FakeRegisterEnrollmentCode> = {},
): FakeRegisterEnrollmentCode {
  return {
    registerId: "register-1",
    lookup: "WXYZ",
    codeHash: "hash-of-previous",
    issuedAt: new Date(NOW.getTime() - 5 * 60_000),
    expiresAt: new Date(NOW.getTime() + 10 * 60_000),
    redeemedAt: null,
    failedAttempts: 2,
    ...overrides,
  };
}

function emitForCaja1(store: FakeBranchRegisterStore) {
  return emitEnrollmentCode(
    { store, clock: new FixedClock(NOW), codes: new SequentialEnrollmentCodes() },
    { registerId: "register-1", actorId: ACTOR },
  );
}

describe("emitEnrollmentCode", () => {
  it("emits a code valid for fifteen minutes and stores only its lookup and hash", async () => {
    const store = storeWithCaja1();

    const outcome = await emitForCaja1(store);

    expect(outcome).toEqual({
      kind: "emitted",
      code: FIRST_CODE,
      expiresAt: FIFTEEN_MINUTES_LATER,
    });
    expect(store.snapshot().codes).toEqual([
      {
        registerId: "register-1",
        lookup: "CODE",
        codeHash: `hash-of-${FIRST_CODE}`,
        issuedAt: NOW,
        expiresAt: FIFTEEN_MINUTES_LATER,
        redeemedAt: null,
        failedAttempts: 0,
      },
    ]);
  });

  it("records the emission with no replaced code for a register that had none", async () => {
    const store = storeWithCaja1();

    await emitForCaja1(store);

    expect(store.snapshot().codeEmissions).toEqual([
      {
        registerId: "register-1",
        actorId: ACTOR,
        replacedCodeExpiresAt: null,
        expiresAt: FIFTEEN_MINUTES_LATER,
      },
    ]);
  });

  it("replaces a code still usable, recording when the replaced code would have expired", async () => {
    const store = storeWithCaja1();
    const replaced = previousCode();
    store.seedCode(replaced);

    await emitForCaja1(store);

    const state = store.snapshot();
    expect(state.codes).toHaveLength(1);
    expect(state.codes[0]).toMatchObject({ lookup: "CODE", failedAttempts: 0 });
    expect(state.codeEmissions[0]?.replacedCodeExpiresAt).toEqual(replaced.expiresAt);
  });

  it.each([
    ["has expired", { expiresAt: NOW }],
    ["was redeemed", { redeemedAt: new Date(NOW.getTime() - 60_000) }],
    ["has used up its failed attempts", { failedAttempts: 5 }],
  ])("records no replaced code when the previous code %s", async (_state, overrides) => {
    const store = storeWithCaja1();
    store.seedCode(previousCode(overrides));

    await emitForCaja1(store);

    const state = store.snapshot();
    expect(state.codeEmissions[0]?.replacedCodeExpiresAt).toBeNull();
    expect(state.codes[0]).toMatchObject({ lookup: "CODE", redeemedAt: null, failedAttempts: 0 });
  });

  it("refuses a register that no longer exists, writing nothing", async () => {
    const store = new FakeBranchRegisterStore();

    const outcome = await emitForCaja1(store);

    expect(outcome).toEqual({ kind: "register_not_found" });
    const state = store.snapshot();
    expect(state.codes).toEqual([]);
    expect(state.codeEmissions).toEqual([]);
  });

  it("locks the register before its current code, and both before writing, in one transaction", async () => {
    const store = storeWithCaja1();

    await emitForCaja1(store);

    expect(store.operationOrder).toEqual([
      "lockRegister",
      "lockEnrollmentCode",
      "recordEnrollmentCode",
      "recordEnrollmentCodeEmission",
    ]);
    expect(store.transactionCount).toBe(1);
  });

  it("keeps the previous code when recording the emission fails", async () => {
    const store = storeWithCaja1();
    const replaced = previousCode();
    store.seedCode(replaced);
    store.failingWrites.add("recordEnrollmentCodeEmission");

    await expect(emitForCaja1(store)).rejects.toThrow("recordEnrollmentCodeEmission failed");
    expect(store.snapshot().codes).toEqual([replaced]);
  });
});

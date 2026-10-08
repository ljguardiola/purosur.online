import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../../shared/index.js";
import {
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_REASON_MAX_LENGTH,
  type CashMovementKind,
} from "../model/cash-movement-kind.js";
import type { CashMovement, CashSession } from "../model/cash-session.js";
import {
  type RecordCashMovementGrant,
  type RecordCashMovementInput,
  recordCashMovement,
} from "./record-cash-movement.js";
import {
  FakeCashLedger,
  type FakeCashLedgerState,
  type FakeCashLedgerWrite,
  SequentialIds,
} from "./test-support/fake-cash-ledger.js";
import {
  type FakeOperationAuthority,
  granting,
  refusing,
} from "./test-support/fake-operation-authority.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-09-30T14:10:00.000Z");
const OPEN_SESSION: CashSession = {
  id: "session-1",
  registerId: "register-1",
  deviceId: "device-1",
  openedBy: "cashier",
  openedAt: new Date("2026-09-30T09:02:00.000Z"),
  openingFloat: 2000000,
  state: "OPEN",
};

const OPENING: CashMovement = {
  id: "opening-1",
  sessionId: "session-1",
  type: "OPENING",
  amount: 4200000,
  actorId: "cashier",
  occurredAt: new Date("2026-09-30T09:02:00.000Z"),
};

function ledger(state: Partial<FakeCashLedgerState> = {}): FakeCashLedger {
  return new FakeCashLedger({ sessions: [OPEN_SESSION], movements: [OPENING], ...state });
}

const CASHIER: RecordCashMovementGrant = { actorId: "cashier", authorizedBy: undefined };
const NOT_SIGNED_IN = { kind: "not_signed_in" } as const;

function record(
  store: FakeCashLedger,
  input: Partial<RecordCashMovementInput> = {},
  authority: FakeOperationAuthority<RecordCashMovementGrant, typeof NOT_SIGNED_IN> = granting(
    CASHIER,
  ),
) {
  return recordCashMovement(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds(), authority },
    { kind: "WITHDRAWAL", amount: 3000000, reason: "Cierre parcial del turno", ...input },
  );
}

function nothingRecorded(store: FakeCashLedger, before: FakeCashLedgerState): void {
  expect(store.state).toEqual(before);
}

describe("recordCashMovement", () => {
  it.each<CashMovementKind>(CASH_MOVEMENT_KINDS)(
    "records a %s movement in the open session with its amount, reason, actor and moment",
    async (kind) => {
      const store = ledger();

      const outcome = await record(store, { kind, amount: 450000, reason: "Flete del proveedor" });

      const movement = {
        id: "id-1",
        sessionId: "session-1",
        type: kind,
        amount: 450000,
        reason: "Flete del proveedor",
        actorId: "cashier",
        occurredAt: NOW,
      };
      expect(outcome).toStrictEqual({ kind: "recorded", movement, grant: CASHIER });
      expect(store.state.movements).toStrictEqual([OPENING, movement]);
    },
  );

  it("records who authorized the movement when another person's PIN was used", async () => {
    const store = ledger();

    await record(store, {}, granting({ actorId: "cashier", authorizedBy: "manager" }));

    expect(store.state.movements.at(-1)).toEqual(
      expect.objectContaining({ actorId: "cashier", authorizedBy: "manager" }),
    );
  });

  it("records the reason without the spaces around it", async () => {
    const store = ledger();

    await record(store, { reason: "  Cambio para el vuelto  " });

    expect(store.state.movements.at(-1)?.reason).toBe("Cambio para el vuelto");
  });

  it("queues a cash_movement_recorded event for the session", async () => {
    const store = ledger();

    await record(store, { kind: "CASH_IN", amount: 500000, reason: " Cambio para el vuelto " });

    expect(store.state.outbox).toEqual([
      {
        event_id: "id-2",
        aggregate_type: "CashSession",
        aggregate_id: "session-1",
        event_type: "cash_movement_recorded",
        schema_version: 1,
        payload: {
          type: "CASH_IN",
          amount: 500000,
          reason: "Cambio para el vuelto",
          ref_type: null,
          ref_id: null,
          actor_id: "cashier",
          authorized_by: null,
          occurred_at: "2026-09-30T14:10:00.000Z",
        },
        occurred_at: "2026-09-30T14:10:00.000Z",
        actor_id: "cashier",
      },
    ]);
  });

  it("carries who authorized the movement in its event", async () => {
    const store = ledger();

    await record(store, {}, granting({ actorId: "cashier", authorizedBy: "manager" }));

    expect(store.state.outbox[0]?.payload).toEqual(
      expect.objectContaining({ authorized_by: "manager" }),
    );
  });

  it("does everything in one transaction", async () => {
    const store = ledger();

    await record(store);

    expect(store.transactions).toBe(1);
  });

  it.each([1, MAX_CASH_AMOUNT_CENTS])("accepts an amount of %i cents", async (amount) => {
    expect((await record(ledger(), { kind: "CASH_IN", amount })).kind).toBe("recorded");
  });

  it.each<CashMovementKind>(["CASH_OUT", "WITHDRAWAL"])(
    "refuses a %s above the session's expected cash, saying how much is expected",
    async (kind) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(await record(store, { kind, amount: 40000000 })).toEqual({
        kind: "exceeds_expected_cash",
        expected: 4200000,
      });
      nothingRecorded(store, before);
    },
  );

  it.each<CashMovementKind>(["CASH_OUT", "WITHDRAWAL"])(
    "records a %s of exactly the session's expected cash",
    async (kind) => {
      expect((await record(ledger(), { kind, amount: 4200000 })).kind).toBe("recorded");
    },
  );

  it("refuses a withdrawal one cent above the session's expected cash", async () => {
    expect(await record(ledger(), { amount: 4200001 })).toEqual({
      kind: "exceeds_expected_cash",
      expected: 4200000,
    });
  });

  it("counts every movement of the session, and only of that session, in the expected cash", async () => {
    const store = ledger({
      movements: [
        OPENING,
        { ...OPENING, id: "in-1", type: "CASH_IN", amount: 500000 },
        { ...OPENING, id: "out-1", type: "CASH_OUT", amount: 200000 },
        { ...OPENING, id: "other-1", sessionId: "session-0", type: "CASH_IN", amount: 9000000 },
      ],
    });

    expect(await record(store, { amount: 4500001 })).toEqual({
      kind: "exceeds_expected_cash",
      expected: 4500000,
    });
    expect((await record(store, { amount: 4500000 })).kind).toBe("recorded");
  });

  it("lets cash brought in pay an expense above what the session held", async () => {
    const store = ledger();

    await record(store, { kind: "CASH_IN", amount: 800000 });

    expect((await record(store, { kind: "CASH_OUT", amount: 5000000 })).kind).toBe("recorded");
  });

  it("refuses a second withdrawal once the first took the expected cash", async () => {
    const store = ledger();
    await record(store, { amount: 4200000 });

    expect(await record(store, { amount: 1 })).toEqual({
      kind: "exceeds_expected_cash",
      expected: 0,
    });
  });

  it("brings in any amount of cash regardless of the expected cash", async () => {
    expect((await record(ledger({ movements: [] }), { kind: "CASH_IN", amount: 1 })).kind).toBe(
      "recorded",
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_CASH_AMOUNT_CENTS + 1])(
    "refuses an amount of %s without opening a transaction",
    async (amount) => {
      const store = ledger();
      const before = structuredClone(store.state);

      const authority = granting(CASHIER);

      expect(await record(store, { amount }, authority)).toEqual({ kind: "invalid_amount" });
      expect(authority.asked).toBe(0);
      expect(store.transactions).toBe(0);
      nothingRecorded(store, before);
    },
  );

  it.each([
    ["an empty reason", ""],
    ["a reason of only spaces", "   "],
    ["a reason longer than allowed", "a".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH + 1)],
  ])(
    "refuses %s, saying the longest reason allowed, without opening a transaction",
    async (_name, reason) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(await record(store, { reason })).toEqual({
        kind: "invalid_reason",
        maxLength: CASH_MOVEMENT_REASON_MAX_LENGTH,
      });
      expect(store.transactions).toBe(0);
      nothingRecorded(store, before);
    },
  );

  it("answers the authority's refusal and records nothing when the movement is not authorized", async () => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(await record(store, {}, refusing(NOT_SIGNED_IN))).toEqual(NOT_SIGNED_IN);
    expect(store.transactions).toBe(0);
    nothingRecorded(store, before);
  });

  it("asks for the authorization once", async () => {
    const authority = granting(CASHIER);

    await record(ledger(), {}, authority);

    expect(authority.asked).toBe(1);
  });

  it("asks for the authorization before checking the reason", async () => {
    expect(await record(ledger(), { reason: "" }, refusing(NOT_SIGNED_IN))).toEqual(NOT_SIGNED_IN);
  });

  it("checks the amount before the reason", async () => {
    expect(await record(ledger(), { amount: 0, reason: "" })).toEqual({ kind: "invalid_amount" });
  });

  it("refuses when no session is open", async () => {
    const store = ledger({
      sessions: [
        {
          ...OPEN_SESSION,
          state: "CLOSED",
          closedBy: "cashier",
          closedAt: new Date("2026-09-30T13:00:00.000Z"),
          expectedCash: 2000000,
          countedCash: 2000000,
          difference: 0,
        },
      ],
    });
    const before = structuredClone(store.state);

    expect(await record(store)).toEqual({ kind: "no_open_session" });
    nothingRecorded(store, before);
  });

  it.each<FakeCashLedgerWrite>(["recordCashMovement", "appendOutboxEvent"])(
    "leaves nothing behind when %s fails",
    async (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      await expect(record(store)).rejects.toThrow(`${write} failed`);
      nothingRecorded(store, before);
    },
  );
});

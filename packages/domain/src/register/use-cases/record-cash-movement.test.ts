import { describe, expect, it } from "vitest";
import { MAX_CASH_AMOUNT_CENTS } from "../model/cash-amount.js";
import {
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_REASON_MAX_LENGTH,
  type CashMovementKind,
} from "../model/cash-movement-kind.js";
import type { CashSession } from "../model/cash-session.js";
import { type RecordCashMovementInput, recordCashMovement } from "./record-cash-movement.js";
import {
  FakeCashLedger,
  type FakeCashLedgerState,
  type FakeCashLedgerWrite,
  SequentialIds,
} from "./test-support/fake-cash-ledger.js";
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

function ledger(state: Partial<FakeCashLedgerState> = {}): FakeCashLedger {
  return new FakeCashLedger({ sessions: [OPEN_SESSION], ...state });
}

function record(store: FakeCashLedger, input: Partial<RecordCashMovementInput> = {}) {
  return recordCashMovement(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    {
      kind: "WITHDRAWAL",
      amount: 3000000,
      reason: "Cierre parcial del turno",
      actorId: "cashier",
      authorizedBy: undefined,
      ...input,
    },
  );
}

function nothingRecorded(store: FakeCashLedger, before: FakeCashLedgerState): void {
  expect(store.state).toEqual(before);
}

describe("recordCashMovement", () => {
  it.each<CashMovementKind>(CASH_MOVEMENT_KINDS)(
    "records a %s movement in the open session with its amount, reason, actor and moment",
    (kind) => {
      const store = ledger();

      const outcome = record(store, { kind, amount: 450000, reason: "Flete del proveedor" });

      const movement = {
        id: "id-1",
        sessionId: "session-1",
        type: kind,
        amount: 450000,
        reason: "Flete del proveedor",
        actorId: "cashier",
        occurredAt: NOW,
      };
      expect(outcome).toStrictEqual({ kind: "recorded", movement });
      expect(store.state.movements).toStrictEqual([movement]);
    },
  );

  it("records who authorized the movement when another person's PIN was used", () => {
    const store = ledger();

    record(store, { authorizedBy: "manager" });

    expect(store.state.movements).toEqual([
      expect.objectContaining({ actorId: "cashier", authorizedBy: "manager" }),
    ]);
  });

  it("records the reason without the spaces around it", () => {
    const store = ledger();

    record(store, { reason: "  Cambio para el vuelto  " });

    expect(store.state.movements[0]?.reason).toBe("Cambio para el vuelto");
  });

  it("queues a cash_movement_recorded event for the session", () => {
    const store = ledger();

    record(store, { kind: "CASH_IN", amount: 500000, reason: " Cambio para el vuelto " });

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

  it("carries who authorized the movement in its event", () => {
    const store = ledger();

    record(store, { authorizedBy: "manager" });

    expect(store.state.outbox[0]?.payload).toEqual(
      expect.objectContaining({ authorized_by: "manager" }),
    );
  });

  it("does everything in one transaction", () => {
    const store = ledger();

    record(store);

    expect(store.transactions).toBe(1);
  });

  it.each([1, MAX_CASH_AMOUNT_CENTS])("accepts an amount of %i cents", (amount) => {
    expect(record(ledger(), { amount }).kind).toBe("recorded");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_CASH_AMOUNT_CENTS + 1])(
    "refuses an amount of %s without opening a transaction",
    (amount) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(record(store, { amount })).toEqual({ kind: "invalid_amount" });
      expect(store.transactions).toBe(0);
      nothingRecorded(store, before);
    },
  );

  it.each([
    ["an empty reason", ""],
    ["a reason of only spaces", "   "],
    ["a reason longer than allowed", "a".repeat(CASH_MOVEMENT_REASON_MAX_LENGTH + 1)],
  ])("refuses %s without opening a transaction", (_name, reason) => {
    const store = ledger();
    const before = structuredClone(store.state);

    expect(record(store, { reason })).toEqual({ kind: "invalid_reason" });
    expect(store.transactions).toBe(0);
    nothingRecorded(store, before);
  });

  it("checks the amount before the reason", () => {
    expect(record(ledger(), { amount: 0, reason: "" })).toEqual({ kind: "invalid_amount" });
  });

  it("refuses when no session is open", () => {
    const store = ledger({ sessions: [{ ...OPEN_SESSION, state: "CLOSED" }] });
    const before = structuredClone(store.state);

    expect(record(store)).toEqual({ kind: "no_open_session" });
    nothingRecorded(store, before);
  });

  it.each<FakeCashLedgerWrite>(["recordCashMovement", "appendOutboxEvent"])(
    "leaves nothing behind when %s fails",
    (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      expect(() => record(store)).toThrow(`${write} failed`);
      nothingRecorded(store, before);
    },
  );
});

import { describe, expect, it } from "vitest";
import type { PaymentTransaction } from "../../sales/index.js";
import { MAX_CASH_AMOUNT_CENTS } from "../model/cash-amount.js";
import type { CashMovement, CashSession, OpenedCashSession } from "../model/cash-session.js";
import { closeCashSession } from "./close-cash-session.js";
import {
  FakeCashLedger,
  type FakeCashLedgerState,
  type FakeCashLedgerWrite,
  SequentialIds,
} from "./test-support/fake-cash-ledger.js";
import { FixedClock } from "./test-support/fake-register-store.js";

const NOW = new Date("2026-09-30T20:15:00.000Z");
const OPEN_SESSION: OpenedCashSession = {
  id: "session-1",
  registerId: "register-1",
  deviceId: "device-1",
  openedBy: "cashier",
  openedAt: new Date("2026-09-30T08:00:00.000Z"),
  openingFloat: 10_000,
  state: "OPEN",
};

const APPROVED_PAYMENT: PaymentTransaction = {
  id: "payment-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "CASH",
  provider: "NONE",
  amount: 1_000,
  state: "APPROVED",
  occurredAt: new Date("2026-09-30T19:00:00.000Z"),
};

function movement(
  type: CashMovement["type"],
  amount: number,
  sessionId = "session-1",
): CashMovement {
  return {
    id: `${sessionId}-${type}-${amount}`,
    sessionId,
    type,
    amount,
    actorId: "cashier",
    occurredAt: new Date("2026-09-30T09:00:00.000Z"),
  };
}

function ledger(state: Partial<FakeCashLedgerState> = {}): FakeCashLedger {
  return new FakeCashLedger({
    sessions: [OPEN_SESSION],
    movements: [movement("OPENING", 10_000)],
    ...state,
  });
}

interface Overrides {
  sessionId?: string;
  closerId?: string;
  authorizedBy?: string | null;
  countedCash?: number;
}

function close(store: FakeCashLedger, overrides: Overrides = {}) {
  return closeCashSession(
    { ledger: store, clock: new FixedClock(NOW), ids: new SequentialIds() },
    {
      sessionId: "session-1",
      closerId: "cashier",
      authorizedBy: null,
      countedCash: 10_000,
      ...overrides,
    },
  );
}

function sessionAfter(store: FakeCashLedger): CashSession | undefined {
  return store.state.sessions.find(({ id }) => id === "session-1");
}

describe("closeCashSession", () => {
  it("closes the session with who closed it, when, and what was expected and counted", () => {
    const store = ledger({
      movements: [
        movement("OPENING", 10_000),
        movement("SALE", 25_000),
        movement("CHANGE", 1_500),
        movement("WITHDRAWAL", 8_000),
      ],
    });

    const outcome = close(store, { countedCash: 25_000 });

    const closed: CashSession = {
      ...OPEN_SESSION,
      state: "CLOSED",
      closedBy: "cashier",
      closedAt: NOW,
      expectedCash: 25_500,
      countedCash: 25_000,
      difference: -500,
    };
    expect(outcome).toEqual({ kind: "closed", session: closed });
    expect(sessionAfter(store)).toEqual(closed);
  });

  it("expects only the movements of the session being closed", () => {
    const store = ledger({
      movements: [
        movement("OPENING", 10_000),
        movement("SALE", 4_000),
        movement("OPENING", 99_000, "earlier"),
        movement("SALE", 77_000, "earlier"),
        movement("WITHDRAWAL", 50_000, "earlier"),
      ],
    });

    expect(close(store, { countedCash: 14_000 })).toMatchObject({
      kind: "closed",
      session: { expectedCash: 14_000, difference: 0 },
    });
  });

  it("subtracts what went out and ignores an earlier closing count", () => {
    const store = ledger({
      movements: [
        movement("OPENING", 10_000),
        movement("CASH_IN", 3_000),
        movement("REFUND", 1_000),
        movement("CASH_OUT", 500),
        movement("CLOSING", 1),
      ],
    });

    expect(close(store)).toMatchObject({ session: { expectedCash: 11_500 } });
  });

  it.each([
    ["short", 9_000, -1_000],
    ["exact", 10_000, 0],
    ["over", 10_750, 750],
  ])("closes when the count is %s, recording the difference", (_name, countedCash, difference) => {
    const store = ledger();

    expect(close(store, { countedCash })).toMatchObject({
      kind: "closed",
      session: { expectedCash: 10_000, countedCash, difference },
    });
    expect(sessionAfter(store)?.state).toBe("CLOSED");
  });

  it("records the count as a CLOSING movement of the closer", () => {
    const store = ledger();

    close(store, { countedCash: 9_000 });

    expect(store.state.movements.at(-1)).toEqual({
      id: "id-1",
      sessionId: "session-1",
      type: "CLOSING",
      amount: 9_000,
      actorId: "cashier",
      occurredAt: NOW,
    });
  });

  it("records who authorized the closing when someone else's session is closed", () => {
    const store = ledger();

    close(store, { closerId: "manager", authorizedBy: "boss" });

    expect(store.state.movements.at(-1)).toMatchObject({
      type: "CLOSING",
      actorId: "manager",
      authorizedBy: "boss",
    });
    expect(sessionAfter(store)).toMatchObject({ closedBy: "manager" });
  });

  it("records no authorizer when none was needed", () => {
    const store = ledger();

    close(store);

    expect(store.state.movements.at(-1)).not.toHaveProperty("authorizedBy");
  });

  it("queues a cash_session_closed event for the session", () => {
    const store = ledger();

    close(store, { countedCash: 9_000 });

    expect(store.state.outbox).toEqual([
      {
        event_id: "id-2",
        aggregate_type: "CashSession",
        aggregate_id: "session-1",
        event_type: "cash_session_closed",
        schema_version: 1,
        payload: {
          closed_by: "cashier",
          closed_at: "2026-09-30T20:15:00.000Z",
          expected_cash: 10_000,
          counted_cash: 9_000,
          difference: -1_000,
        },
        occurred_at: "2026-09-30T20:15:00.000Z",
        actor_id: "cashier",
      },
    ]);
  });

  it("does everything in one transaction", () => {
    const store = ledger();

    close(store);

    expect(store.transactions).toBe(1);
  });

  it.each([0, MAX_CASH_AMOUNT_CENTS])("accepts a count of %i cents", (countedCash) => {
    expect(close(ledger(), { countedCash }).kind).toBe("closed");
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_CASH_AMOUNT_CENTS + 1])(
    "refuses a count of %s without opening a transaction",
    (countedCash) => {
      const store = ledger();
      const before = structuredClone(store.state);

      expect(close(store, { countedCash })).toEqual({ kind: "invalid_counted_cash" });
      expect(store.transactions).toBe(0);
      expect(store.state).toEqual(before);
    },
  );

  it.each([
    ["there is no open session", { sessions: [] }],
    ["the session is already closed", { sessions: [closedSession()] }],
    [
      "the open session is not the one being closed",
      { sessions: [{ ...OPEN_SESSION, id: "other" }] },
    ],
  ])("refuses when %s", (_name, state) => {
    const store = ledger(state);
    const before = structuredClone(store.state);

    expect(close(store)).toEqual({ kind: "no_open_session" });
    expect(store.state).toEqual(before);
  });

  it("refuses while a sale is open, telling its total, and records nothing", () => {
    const store = ledger({ openSale: { total: 4_250, payments: [] } });
    const before = structuredClone(store.state);

    expect(close(store)).toEqual({ kind: "open_sale", total: 4_250, cancellable: true });
    expect(store.state).toEqual(before);
  });

  it("refuses an open sale even when its total is zero", () => {
    expect(close(ledger({ openSale: { total: 0, payments: [] } }))).toEqual({
      kind: "open_sale",
      total: 0,
      cancellable: true,
    });
  });

  it("tells that an open sale with an approved payment cannot be cancelled", () => {
    const store = ledger({ openSale: { total: 4_250, payments: [APPROVED_PAYMENT] } });

    expect(close(store)).toEqual({ kind: "open_sale", total: 4_250, cancellable: false });
  });

  it("checks the session before the open sale", () => {
    const store = ledger({ sessions: [], openSale: { total: 100, payments: [] } });

    expect(close(store)).toEqual({ kind: "no_open_session" });
  });

  it.each<FakeCashLedgerWrite>(["recordCashMovement", "recordClosedSession", "appendOutboxEvent"])(
    "leaves nothing behind when %s fails",
    (write) => {
      const store = ledger();
      const before = structuredClone(store.state);
      store.failOn = write;

      expect(() => close(store)).toThrow(`${write} failed`);
      expect(store.state).toEqual(before);
    },
  );
});

function closedSession(): CashSession {
  return {
    ...OPEN_SESSION,
    state: "CLOSED",
    closedBy: "cashier",
    closedAt: new Date("2026-09-30T18:00:00.000Z"),
    expectedCash: 10_000,
    countedCash: 10_000,
    difference: 0,
  };
}

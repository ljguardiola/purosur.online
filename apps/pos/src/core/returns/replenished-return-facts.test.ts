import { aCompletedSaleFact, aReturnedSaleFact } from "@purosur/domain/sync/test-support";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { cashBalanceFor } from "../register/cash-session-requests";
import { insertCashMovement, insertOpenedSession } from "../register/sqlite-cash-ledger";
import { applyReplenishedSaleFact } from "../sales/replenished-sale-facts";
import { addToStockBalance } from "../stock/sqlite-stock-ledger";
import { applyReplenishedReturnFact } from "./replenished-return-facts";

const SOURCE = { eventId: "event-1", deviceId: "device-old" };

let database: LocalDatabase;

const RETURN_CASH_MOVEMENT = {
  id: "return-movement-1",
  type: "REFUND",
  amount: 1000,
  actorId: "cashier-1",
  occurredAt: new Date("2026-10-08T10:00:00.000Z"),
} as const;

function returnSale(overrides: Parameters<typeof aReturnedSaleFact>[0] = {}): void {
  applyReplenishedReturnFact(
    database,
    aReturnedSaleFact({ cashMovements: [RETURN_CASH_MOVEMENT], ...overrides }),
  );
}

function rows(query: string): unknown[] {
  return database.prepare(query).all();
}

function openSession(id: string, openedAt: string): void {
  insertOpenedSession(database, {
    id,
    registerId: "register-new",
    deviceId: "device-old",
    openedBy: "cashier-1",
    openedAt: new Date(openedAt),
    openingFloat: 5000,
    state: "OPEN",
  });
  insertCashMovement(database, {
    id: `opening-${id}`,
    sessionId: id,
    type: "OPENING",
    amount: 5000,
    actorId: "cashier-1",
    occurredAt: new Date(openedAt),
  });
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('register-new', 'Caja 1', 1, 0);
     UPDATE sync_state SET device_id = 'device-new';`,
  );
  openSession("session-1", "2026-10-07T08:00:00.000Z");
  addToStockBalance(database, "product-1", 10);
  applyReplenishedSaleFact(database, aCompletedSaleFact({ operationNumber: 41 }), SOURCE);
  database.exec(
    "UPDATE cash_sessions SET state = 'CLOSED', closed_at = '2026-10-07T20:00:00.000Z'",
  );
  openSession("session-2", "2026-10-08T08:00:00.000Z");
});

afterEach(() => {
  database.close();
});

describe("replenishing a return into a restored register", () => {
  it("holds the return of the sale and its lines, with how its ticket was read and who authorized it", () => {
    returnSale({ authorizedBy: "supervisor-1", ticketSource: "TYPED" });

    expect(
      rows(
        "SELECT id, sale_id, register_id, device_id, session_id, actor_id, authorized_by, ticket_source, occurred_at FROM returns",
      ),
    ).toEqual([
      {
        id: "return-1",
        sale_id: "sale-1",
        register_id: "register-new",
        device_id: expect.any(String),
        session_id: "session-2",
        actor_id: "cashier-1",
        authorized_by: "supervisor-1",
        ticket_source: "TYPED",
        occurred_at: "2026-10-08T10:00:00.000Z",
      },
    ]);
    expect(
      rows(
        "SELECT return_id, sale_line_id, quantity, reason, disposition, refunded_amount FROM return_lines",
      ),
    ).toEqual([
      {
        return_id: "return-1",
        sale_line_id: "line-1",
        quantity: 1,
        reason: "change_of_mind",
        disposition: "restock",
        refunded_amount: 1000,
      },
    ]);
  });

  it("holds the refund and the cash given back, in the session the return was made in", () => {
    returnSale();

    expect(rows("SELECT id, payment_id, amount, return_id FROM payment_refunds")).toEqual([
      { id: "refund-1", payment_id: "payment-1", amount: 1000, return_id: "return-1" },
    ]);
    expect(
      rows(
        "SELECT id, session_id, type, amount, ref_type, ref_id FROM cash_movements WHERE type = 'REFUND'",
      ),
    ).toEqual([
      {
        id: "return-movement-1",
        session_id: "session-2",
        type: "REFUND",
        amount: 1000,
        ref_type: "return",
        ref_id: "return-1",
      },
    ]);
    expect(cashBalanceFor(database)?.expected).toBe(5000 - 1000);
  });

  it("puts the returned stock back on the balance and keeps the movement that did", () => {
    returnSale();

    expect(
      rows("SELECT id, kind, sale_line_id, delta FROM stock_movements WHERE kind = 'return'"),
    ).toEqual([{ id: "movement-2", kind: "return", sale_line_id: "line-1", delta: 1000 }]);
    expect(rows("SELECT quantity FROM stock_balances")).toEqual([{ quantity: 1010 }]);
  });

  it("keeps a discarded item's loss, tied to no line, and leaves the balance as the sale left it", () => {
    returnSale({
      lines: [
        {
          saleLineId: "line-1",
          productId: "product-1",
          quantity: 1,
          reason: "defective",
          disposition: "discard",
          refundedAmount: 1000,
        },
      ],
      stockMovements: [
        {
          id: "movement-2",
          saleLineId: "line-1",
          productId: "product-1",
          kind: "return",
          reason: null,
          delta: 1000,
        },
        {
          id: "movement-3",
          saleLineId: "line-1",
          productId: "product-1",
          kind: "loss",
          reason: "return_discard",
          delta: -1000,
        },
      ],
    });

    expect(
      rows(
        "SELECT id, kind, sale_line_id, delta FROM stock_movements WHERE id IN ('movement-2', 'movement-3') ORDER BY id",
      ),
    ).toEqual([
      { id: "movement-2", kind: "return", sale_line_id: "line-1", delta: 1000 },
      { id: "movement-3", kind: "loss", sale_line_id: null, delta: -1000 },
    ]);
    expect(rows("SELECT quantity FROM stock_balances")).toEqual([{ quantity: 10 }]);
  });

  it("changes nothing when the snapshot already holds the return", () => {
    returnSale();
    const before = rows("SELECT * FROM stock_balances");

    returnSale();

    expect(rows("SELECT id FROM returns")).toEqual([{ id: "return-1" }]);
    expect(rows("SELECT id FROM payment_refunds")).toEqual([{ id: "refund-1" }]);
    expect(rows("SELECT id FROM cash_movements WHERE type = 'REFUND'")).toEqual([
      { id: "return-movement-1" },
    ]);
    expect(rows("SELECT * FROM stock_balances")).toEqual(before);
  });

  it("holds a return of a sale another register rang up, in the register and session it was made in", () => {
    returnSale({ saleId: "sale-elsewhere" });

    expect(rows("SELECT id, sale_id, register_id, session_id FROM returns")).toEqual([
      {
        id: "return-1",
        sale_id: "sale-elsewhere",
        register_id: "register-new",
        session_id: "session-2",
      },
    ]);
    expect(rows("SELECT id, payment_id, return_id FROM payment_refunds")).toEqual([
      { id: "refund-1", payment_id: "payment-1", return_id: "return-1" },
    ]);
    expect(rows("SELECT return_id, sale_line_id FROM return_lines")).toEqual([
      { return_id: "return-1", sale_line_id: "line-1" },
    ]);
  });
});

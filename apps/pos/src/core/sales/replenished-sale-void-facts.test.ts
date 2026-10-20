import { aCompletedSaleFact, aVoidedSaleFact } from "@purosur/domain/sync/test-support";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { insertDeferredSale } from "../fiscal/sqlite-deferred-sales";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { cashBalanceFor } from "../register/cash-session-requests";
import { insertCashMovement, insertOpenedSession } from "../register/sqlite-cash-ledger";
import { addToStockBalance } from "../stock/sqlite-stock-ledger";
import { applyReplenishedSaleFact } from "./replenished-sale-facts";
import { applyReplenishedSaleVoidFact } from "./replenished-sale-void-facts";

const SOURCE = { eventId: "event-1", deviceId: "device-old" };

let database: LocalDatabase;

function voidSale(overrides: Parameters<typeof aVoidedSaleFact>[0] = {}): void {
  applyReplenishedSaleVoidFact(database, aVoidedSaleFact(overrides));
}

function rows(query: string): unknown[] {
  return database.prepare(query).all();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO own_register (id, name, version, removed) VALUES ('register-new', 'Caja 1', 1, 0);
     UPDATE sync_state SET device_id = 'device-new';`,
  );
  insertOpenedSession(database, {
    id: "session-1",
    registerId: "register-new",
    deviceId: "device-old",
    openedBy: "cashier-1",
    openedAt: new Date("2026-10-07T08:00:00.000Z"),
    openingFloat: 5000,
    state: "OPEN",
  });
  insertCashMovement(database, {
    id: "movement-opening",
    sessionId: "session-1",
    type: "OPENING",
    amount: 5000,
    actorId: "cashier-1",
    occurredAt: new Date("2026-10-07T08:00:00.000Z"),
  });
  addToStockBalance(database, "product-1", 10);
  applyReplenishedSaleFact(database, aCompletedSaleFact({ operationNumber: 41 }), SOURCE);
});

afterEach(() => {
  database.close();
});

describe("replenishing a voided sale into a restored register", () => {
  it("voids the completed sale, with when and who authorized it", () => {
    voidSale();

    expect(rows("SELECT id, state, voided_at, void_authorized_by FROM sales")).toEqual([
      {
        id: "sale-1",
        state: "VOIDED",
        voided_at: "2026-10-07T10:05:00.000Z",
        void_authorized_by: "supervisor-1",
      },
    ]);
  });

  it("holds the refund and the cash given back", () => {
    voidSale();

    expect(rows("SELECT id, payment_id, amount FROM payment_refunds")).toEqual([
      { id: "refund-1", payment_id: "payment-1", amount: 1000 },
    ]);
    expect(cashBalanceFor(database)?.expected).toBe(5000 + 1500 - 1000);
  });

  it("returns the sale's stock to the balance and keeps the movement that did", () => {
    voidSale();

    expect(rows("SELECT id, kind, sale_line_id, delta FROM stock_movements")).toEqual([
      { id: "movement-3", kind: "sale_void", sale_line_id: "line-1", delta: 2000 },
    ]);
    expect(rows("SELECT quantity FROM stock_balances")).toEqual([{ quantity: 2010 }]);
  });

  it("changes nothing when the snapshot already holds the sale voided", () => {
    voidSale();
    const before = [
      rows("SELECT * FROM sales"),
      rows("SELECT * FROM payment_refunds"),
      rows("SELECT * FROM cash_movements"),
      rows("SELECT * FROM stock_movements"),
      rows("SELECT * FROM stock_balances"),
    ];

    voidSale();

    expect([
      rows("SELECT * FROM sales"),
      rows("SELECT * FROM payment_refunds"),
      rows("SELECT * FROM cash_movements"),
      rows("SELECT * FROM stock_movements"),
      rows("SELECT * FROM stock_balances"),
    ]).toEqual(before);
  });

  it("is refused for a sale the register does not hold", () => {
    expect(() => voidSale({ id: "sale-9" })).toThrow("sale sale-9 is not held");
  });

  it("cancels the deferred record the sale still has when the event says it was cancelled", () => {
    insertDeferredSale(database, {
      id: "deferred-1",
      saleId: "sale-1",
      occurredAt: new Date("2026-10-07T10:00:00.000Z"),
      total: 1500,
      reason: "pre_emission_gate_failed",
      shortCode: "ABCD1234",
      routedAt: new Date("2026-10-07T10:00:01.000Z"),
    });

    voidSale({ deferredRecordCancelled: true });

    expect(rows("SELECT sale_id, cancelled_at FROM deferred_sales")).toEqual([
      { sale_id: "sale-1", cancelled_at: "2026-10-07T10:05:00.000Z" },
    ]);
  });

  it("has no deferred record to cancel when the register never held one", () => {
    expect(() => voidSale({ deferredRecordCancelled: true })).not.toThrow();
  });

  it("writes no credit note, since the event holds only the request and not how it was answered", () => {
    voidSale();

    expect(rows("SELECT * FROM sale_void_credit_notes")).toEqual([]);
  });
});

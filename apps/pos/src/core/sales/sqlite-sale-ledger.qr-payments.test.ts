import type { PendingQrSalePayment } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

const STARTED_AT = new Date("2026-10-09T12:00:00.000Z");
const WAIT_ENDS_AT = new Date("2026-10-09T12:03:00.000Z");
const PENDING: PendingQrSalePayment = {
  id: "qr-1",
  saleId: "sale-1",
  kind: "SALE",
  method: "QR",
  provider: "MERCADOPAGO_QR",
  state: "PENDING",
  amount: 3000,
  occurredAt: STARTED_AT,
  waitEndsAt: WAIT_ENDS_AT,
};

let database: LocalDatabase;
let ledger: SqliteSaleLedger;

function stateOf(id: string): unknown {
  return database.prepare("SELECT state FROM payment_transactions WHERE id = ?").get(id);
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
     VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'OPEN', NULL),
            ('sale-2', 'register-1', 'device-1', 'session-1', 'u1', 'COMPLETED', '2026-10-09T09:00:00.000Z');`,
  );
  ledger = new SqliteSaleLedger(database, { activePerson: () => undefined });
});

afterEach(() => {
  database.close();
});

describe("the sale ledger's QR payments", () => {
  it("keeps a pending QR payment and finds it with the end of its wait", () => {
    ledger.transaction((tx) => tx.recordPendingQrPayment(PENDING));

    expect(ledger.transaction((tx) => tx.pendingQrPayment("qr-1"))).toEqual(PENDING);
    expect(ledger.transaction((tx) => tx.pendingQrPaymentsOf("sale-1"))).toEqual([PENDING]);
    expect(stateOf("qr-1")).toEqual({ state: "PENDING" });
  });

  it("does not count a pending QR payment among the sale's payments", () => {
    ledger.transaction((tx) => tx.recordPendingQrPayment(PENDING));

    expect(ledger.transaction((tx) => tx.salePayments("sale-1"))).toEqual([]);
  });

  it("finds no pending QR payment for an unknown one or another sale's", () => {
    ledger.transaction((tx) => tx.recordPendingQrPayment(PENDING));

    expect(ledger.transaction((tx) => tx.pendingQrPayment("missing"))).toBeUndefined();
    expect(ledger.transaction((tx) => tx.pendingQrPaymentsOf("sale-2"))).toEqual([]);
  });

  it("approves a pending QR payment, which then counts among the sale's payments", () => {
    ledger.transaction((tx) => tx.recordPendingQrPayment(PENDING));

    ledger.transaction((tx) => tx.approvePendingQrPayment("qr-1"));

    expect(ledger.transaction((tx) => tx.salePayments("sale-1"))).toEqual([
      {
        id: "qr-1",
        saleId: "sale-1",
        kind: "SALE",
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 3000,
        state: "APPROVED",
        occurredAt: STARTED_AT,
      },
    ]);
    expect(ledger.transaction((tx) => tx.pendingQrPayment("qr-1"))).toBeUndefined();
    expect(ledger.transaction((tx) => tx.pendingQrPaymentsOf("sale-1"))).toEqual([]);
  });

  it("leaves a QR payment that already ended as it is when asked to approve it", () => {
    ledger.transaction((tx) => tx.recordPendingQrPayment(PENDING));
    database.prepare("UPDATE payment_transactions SET state = 'DECLINED' WHERE id = 'qr-1'").run();

    ledger.transaction((tx) => tx.approvePendingQrPayment("qr-1"));

    expect(stateOf("qr-1")).toEqual({ state: "DECLINED" });
    expect(ledger.transaction((tx) => tx.pendingQrPayment("qr-1"))).toBeUndefined();
  });

  it("keeps a cancelled sale that holds a pending QR payment, with its payment", () => {
    ledger.transaction((tx) => tx.recordPendingQrPayment(PENDING));

    ledger.transaction((tx) => tx.recordCancelledSale("sale-1", WAIT_ENDS_AT, undefined));

    expect(
      database.prepare("SELECT state, occurred_at FROM sales WHERE id = 'sale-1'").get(),
    ).toEqual({ state: "CANCELLED", occurred_at: WAIT_ENDS_AT.toISOString() });
    expect(stateOf("qr-1")).toEqual({ state: "PENDING" });
  });
});

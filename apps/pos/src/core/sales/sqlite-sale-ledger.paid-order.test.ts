import type { SalePayment } from "@purosur/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { SqliteSaleLedger } from "./sqlite-sale-ledger";

const PAID_AT = new Date("2026-10-09T12:00:00.000Z");

let database: LocalDatabase;
let ledger: SqliteSaleLedger;

function recordOrder(id: string, method: "QR" | "POINT", cardType: string | null = null): void {
  database
    .prepare(
      `INSERT INTO paid_orders_without_sale
         (payment_transaction_id, sale_id, method, provider, card_type, amount, created_at, recorded_at)
       VALUES (?, 'sale-gone', ?, ?, ?, 4500, '2026-10-09T11:00:00.000Z', '2026-10-09T11:05:00.000Z')`,
    )
    .run(id, method, method === "QR" ? "MERCADOPAGO_QR" : "MERCADOPAGO_POINT", cardType);
}

function orderPayment(overrides: Partial<SalePayment> = {}): SalePayment {
  return {
    id: "order-1",
    saleId: "sale-1",
    kind: "SALE",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: 4500,
    state: "APPROVED",
    occurredAt: PAID_AT,
    ...overrides,
  } as SalePayment;
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database.exec(
    `INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
     VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
     VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'OPEN', NULL);`,
  );
  recordOrder("order-1", "QR");
  ledger = new SqliteSaleLedger(database, { activePerson: () => undefined });
});

afterEach(() => {
  database.close();
});

describe("the sale ledger's paid orders", () => {
  it("links an open sale to a paid order and finds the order from the sale", () => {
    ledger.transaction((tx) => tx.recordSaleRebuiltAgainstPaidOrder("sale-1", "order-1"));

    expect(ledger.transaction((tx) => tx.paidOrderOfSale("sale-1"))).toMatchObject({
      paymentTransactionId: "order-1",
      amount: 4500,
      method: "QR",
      provider: "MERCADOPAGO_QR",
      resolved: false,
    });
  });

  it("finds a paid order a sale could be rebuilt against", () => {
    expect(ledger.transaction((tx) => tx.rebuildablePaidOrder("order-1"))).toMatchObject({
      paymentTransactionId: "order-1",
      amount: 4500,
    });
    expect(ledger.transaction((tx) => tx.rebuildablePaidOrder("missing"))).toBeUndefined();
  });

  it("lists the order as unresolved and not blocking while its rebuilt sale is open", () => {
    ledger.transaction((tx) => tx.recordSaleRebuiltAgainstPaidOrder("sale-1", "order-1"));

    expect(ledger.transaction((tx) => tx.paidOrdersWithoutSale())).toMatchObject([
      { paymentTransactionId: "order-1", resolved: false, rebuiltSaleId: "sale-1" },
    ]);
  });

  it("drops the link when the rebuilt sale is discarded, listing the order again to be rebuilt", () => {
    ledger.transaction((tx) => {
      tx.recordSaleRebuiltAgainstPaidOrder("sale-1", "order-1");
      tx.discardOpenSale("sale-1");
    });

    expect(database.prepare("SELECT * FROM sales_rebuilt_against_paid_orders").all()).toEqual([]);
    expect(ledger.transaction((tx) => tx.paidOrderOfSale("sale-1"))).toBeUndefined();
    expect(ledger.transaction((tx) => tx.rebuildablePaidOrder("order-1"))).toMatchObject({
      resolved: false,
    });
  });

  it("records the approved QR payment of the order on the sale", () => {
    ledger.transaction((tx) => tx.recordPayment(orderPayment()));

    expect(ledger.transaction((tx) => tx.salePayments("sale-1"))).toMatchObject([
      { id: "order-1", saleId: "sale-1", method: "QR", amount: 4500, state: "APPROVED" },
    ]);
  });

  it.each(["DEBIT", "CREDIT"] as const)(
    "records the approved Point payment of the order with its %s card type",
    (cardType) => {
      ledger.transaction((tx) =>
        tx.recordPayment(
          orderPayment({
            id: "order-2",
            method: "POINT",
            provider: "MERCADOPAGO_POINT",
            cardType,
          } as Partial<SalePayment>),
        ),
      );

      expect(ledger.transaction((tx) => tx.salePayments("sale-1"))).toMatchObject([
        { id: "order-2", method: "POINT", provider: "MERCADOPAGO_POINT", cardType },
      ]);
    },
  );

  it("records an approved Point payment of an order with no known card type", () => {
    ledger.transaction((tx) =>
      tx.recordPayment(
        orderPayment({
          id: "order-2",
          method: "POINT",
          provider: "MERCADOPAGO_POINT",
          cardType: null,
        } as Partial<SalePayment>),
      ),
    );

    expect(ledger.transaction((tx) => tx.salePayments("sale-1"))).toMatchObject([
      { id: "order-2", cardType: null },
    ]);
  });
});

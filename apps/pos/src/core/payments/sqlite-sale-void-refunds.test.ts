import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { insertPaymentRefund } from "./sqlite-sale-payments";
import { SqliteSaleVoidRefunds } from "./sqlite-sale-void-refunds";

const OCCURRED_AT = new Date("2026-09-30T12:00:00.000Z");

let database: LocalDatabase;

function addSale(id: string): void {
  database
    .prepare(
      "INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at, voided_at) VALUES (?, 'register-1', 'device-1', 'session-1', 'u1', 'VOIDED', ?, ?)",
    )
    .run(id, OCCURRED_AT.toISOString(), OCCURRED_AT.toISOString());
}

function addPayment(
  id: string,
  saleId: string,
  method: "CASH" | "QR" | "POINT",
  amount: number,
  approvalOrder: number,
  cardType: "DEBIT" | "CREDIT" | null = null,
): void {
  const provider =
    method === "QR" ? "MERCADOPAGO_QR" : method === "POINT" ? "MERCADOPAGO_POINT" : "NONE";
  database
    .prepare(
      "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, card_type, amount, state, approval_order, occurred_at, wait_ends_at) VALUES (?, ?, 'SALE', ?, ?, ?, ?, 'APPROVED', ?, ?, ?)",
    )
    .run(
      id,
      saleId,
      method,
      provider,
      cardType,
      amount,
      approvalOrder,
      OCCURRED_AT.toISOString(),
      method === "CASH" ? null : OCCURRED_AT.toISOString(),
    );
}

function addRefund(
  id: string,
  paymentId: string,
  method: "CASH" | "QR" | "POINT",
  amount: number,
  state: "PENDING" | "APPROVED",
  returnId?: string,
): void {
  insertPaymentRefund(database, {
    id,
    paymentId,
    method,
    provider:
      method === "QR" ? "MERCADOPAGO_QR" : method === "POINT" ? "MERCADOPAGO_POINT" : "NONE",
    amount,
    state,
    occurredAt: OCCURRED_AT,
    ...(returnId === undefined ? {} : { returnId }),
  });
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  database
    .prepare(
      "INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state) VALUES ('session-1', 'register-1', 'device-1', 'u1', ?, 0, 'OPEN')",
    )
    .run(OCCURRED_AT.toISOString());
  addSale("sale-1");
  addSale("sale-2");
});

afterEach(() => {
  database.close();
});

describe("the refunds the void of a sale recorded", () => {
  it("are none for a sale without refunds", () => {
    expect(new SqliteSaleVoidRefunds(database).refundsOfVoid("sale-1")).toEqual([]);
  });

  it("carry each refund's method, amount, planned state and the card type of its payment, in the order the payments were approved", () => {
    addPayment("pay-point", "sale-1", "POINT", 4000, 2, "CREDIT");
    addPayment("pay-cash", "sale-1", "CASH", 500, 1);
    addPayment("pay-qr", "sale-1", "QR", 12300, 3);
    addRefund("refund-point", "pay-point", "POINT", 4000, "PENDING");
    addRefund("refund-qr", "pay-qr", "QR", 12300, "PENDING");
    addRefund("refund-cash", "pay-cash", "CASH", 500, "APPROVED");

    expect(new SqliteSaleVoidRefunds(database).refundsOfVoid("sale-1")).toEqual([
      { method: "CASH", cardType: null, amount: 500, state: "APPROVED" },
      { method: "POINT", cardType: "CREDIT", amount: 4000, state: "PENDING" },
      { method: "QR", cardType: null, amount: 12300, state: "PENDING" },
    ]);
  });

  it("leave out the refunds of a return and of other sales", () => {
    addPayment("pay-1", "sale-1", "QR", 12300, 1);
    addPayment("pay-2", "sale-2", "QR", 800, 2);
    database
      .prepare(
        `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
         VALUES ('return-1', 'sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'QR', ?)`,
      )
      .run(OCCURRED_AT.toISOString());
    addRefund("refund-void", "pay-1", "QR", 10000, "PENDING");
    addRefund("refund-return", "pay-1", "QR", 2300, "PENDING", "return-1");
    addRefund("refund-other", "pay-2", "QR", 800, "PENDING");

    expect(new SqliteSaleVoidRefunds(database).refundsOfVoid("sale-1")).toEqual([
      { method: "QR", cardType: null, amount: 10000, state: "PENDING" },
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LocalDatabase, openLocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { readSalePayments } from "./sqlite-sale-payments";

const OCCURRED_AT = new Date("2026-09-30T12:00:00.000Z");
const CONFIRMED_AT = new Date("2026-09-30T12:01:00.000Z");

let database: LocalDatabase;

function addSession(): void {
  database
    .prepare(
      "INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state) VALUES ('session-1', 'register-1', 'device-1', 'u1', ?, 0, 'OPEN')",
    )
    .run(OCCURRED_AT.toISOString());
}

function addSale(id: string, state: string): void {
  database
    .prepare(
      "INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at) VALUES (?, 'register-1', 'device-1', 'session-1', 'u1', ?, ?)",
    )
    .run(id, state, state === "OPEN" ? null : OCCURRED_AT.toISOString());
}

function addPayment(id: string, saleId: string, amount: number, tendered: number | null): void {
  database
    .prepare(
      "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, state, occurred_at) VALUES (?, ?, 'SALE', 'CASH', 'NONE', ?, ?, 'APPROVED', ?)",
    )
    .run(id, saleId, amount, tendered, OCCURRED_AT.toISOString());
}

function addTransfer(id: string, saleId: string, amount: number): void {
  database
    .prepare(
      "INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, tendered, authorized_by, confirmed_at, state, occurred_at) VALUES (?, ?, 'SALE', 'TRANSFER', 'NONE', ?, NULL, 'u2', ?, 'APPROVED', ?)",
    )
    .run(id, saleId, amount, CONFIRMED_AT.toISOString(), OCCURRED_AT.toISOString());
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  addSession();
  addSale("sale-1", "OPEN");
  addSale("sale-2", "COMPLETED");
});

afterEach(() => {
  database.close();
});

describe("the payments of a sale", () => {
  it("are none while the sale has no payment", () => {
    expect(readSalePayments(database, "sale-1")).toEqual([]);
  });

  it("read back each payment with what was tendered and when it happened", () => {
    addPayment("payment-1", "sale-1", 1500, 2000);

    expect(readSalePayments(database, "sale-1")).toEqual([
      {
        id: "payment-1",
        saleId: "sale-1",
        kind: "SALE",
        method: "CASH",
        provider: "NONE",
        amount: 1500,
        tendered: 2000,
        state: "APPROVED",
        occurredAt: OCCURRED_AT,
      },
    ]);
  });

  it("leave out what was tendered when the payment has none", () => {
    addPayment("payment-1", "sale-1", 1500, null);

    const [payment] = readSalePayments(database, "sale-1");

    expect(payment).not.toHaveProperty("tendered");
  });

  it("read back a transfer with who confirmed it and when, and nothing tendered", () => {
    addTransfer("payment-1", "sale-1", 1500);

    const [payment] = readSalePayments(database, "sale-1");

    expect(payment).toEqual({
      id: "payment-1",
      saleId: "sale-1",
      kind: "SALE",
      method: "TRANSFER",
      provider: "NONE",
      amount: 1500,
      authorizedBy: "u2",
      confirmedAt: CONFIRMED_AT,
      state: "APPROVED",
      occurredAt: OCCURRED_AT,
    });
    expect(payment).not.toHaveProperty("tendered");
  });

  it("come in the order they were recorded", () => {
    addPayment("payment-b", "sale-1", 1000, null);
    addPayment("payment-a", "sale-1", 500, null);

    expect(readSalePayments(database, "sale-1").map((payment) => payment.id)).toEqual([
      "payment-b",
      "payment-a",
    ]);
  });

  it("leave out the payments of another sale", () => {
    addPayment("payment-1", "sale-1", 1500, null);
    addPayment("payment-2", "sale-2", 700, null);

    expect(readSalePayments(database, "sale-1").map((payment) => payment.id)).toEqual([
      "payment-1",
    ]);
  });
});

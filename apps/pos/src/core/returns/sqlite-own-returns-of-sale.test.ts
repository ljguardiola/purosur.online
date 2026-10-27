import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteOwnReturnsOfSale } from "./sqlite-own-returns-of-sale";
import { insertStoredReturn, openSoldSaleDatabase } from "./test-support/sold-sale-database";

let database: LocalDatabase;

function refund(id: string, returnId: string | null, paymentId: string, amount: number): void {
  database
    .prepare(
      `INSERT INTO payment_refunds (id, payment_id, return_id, method, provider, amount, state, occurred_at)
       VALUES (?, ?, ?, 'CASH', 'NONE', ?, 'APPROVED', '2026-09-20T12:00:00.000Z')`,
    )
    .run(id, paymentId, returnId, amount);
}

beforeEach(() => {
  database = openSoldSaleDatabase();
});

afterEach(() => {
  database.close();
});

describe("this register's returns of a sale", () => {
  it("holds none for a sale nobody returned from here", () => {
    expect(new SqliteOwnReturnsOfSale(database).returnsOfSale("sale-1")).toEqual([]);
  });

  it("lists each return of the sale with its lines and the refunds it paid per payment", () => {
    insertStoredReturn(database, "return-1", [
      { saleLineId: "line-1", quantity: 1, refundedAmount: 2500 },
      { saleLineId: "line-2", quantity: 2, refundedAmount: 1000 },
    ]);
    insertStoredReturn(database, "return-2", [
      { saleLineId: "line-1", quantity: 1, refundedAmount: 2500 },
    ]);
    refund("refund-1", "return-1", "pay-cash", 3000);
    refund("refund-2", "return-1", "pay-cash", 500);
    refund("refund-3", "return-2", "pay-cash", 2500);

    const returns = new SqliteOwnReturnsOfSale(database).returnsOfSale("sale-1");

    expect(returns).toEqual([
      {
        id: "return-1",
        lines: [
          { saleLineId: "line-1", quantity: 1, refundedAmount: 2500 },
          { saleLineId: "line-2", quantity: 2, refundedAmount: 1000 },
        ],
        refunds: [
          { paymentId: "pay-cash", amount: 3000 },
          { paymentId: "pay-cash", amount: 500 },
        ],
      },
      {
        id: "return-2",
        lines: [{ saleLineId: "line-1", quantity: 1, refundedAmount: 2500 }],
        refunds: [{ paymentId: "pay-cash", amount: 2500 }],
      },
    ]);
  });

  it("holds a return of a sale this register does not hold", () => {
    database.exec(
      `INSERT INTO returns (id, sale_id, register_id, device_id, session_id, actor_id, ticket_source, occurred_at)
       VALUES ('return-9', 'sale-elsewhere', 'register-2', 'device-b', 'session-1', 'u1', 'TYPED', '2026-09-20T12:00:00.000Z');
       INSERT INTO return_lines (return_id, sale_line_id, quantity, reason, disposition, refunded_amount)
       VALUES ('return-9', 'line-elsewhere', 1, 'defective', 'discard', 800);`,
    );
    refund("refund-9", "return-9", "pay-elsewhere", 800);

    expect(new SqliteOwnReturnsOfSale(database).returnsOfSale("sale-elsewhere")).toEqual([
      {
        id: "return-9",
        lines: [{ saleLineId: "line-elsewhere", quantity: 1, refundedAmount: 800 }],
        refunds: [{ paymentId: "pay-elsewhere", amount: 800 }],
      },
    ]);
  });

  it("leaves out the returns of other sales and the refunds no return paid", () => {
    insertStoredReturn(database, "return-1", [
      { saleLineId: "line-1", quantity: 1, refundedAmount: 2500 },
    ]);
    refund("refund-void", null, "pay-cash", 6000);

    const own = new SqliteOwnReturnsOfSale(database);

    expect(own.returnsOfSale("other-sale")).toEqual([]);
    expect(own.returnsOfSale("sale-1")).toEqual([
      {
        id: "return-1",
        lines: [{ saleLineId: "line-1", quantity: 1, refundedAmount: 2500 }],
        refunds: [],
      },
    ]);
  });
});

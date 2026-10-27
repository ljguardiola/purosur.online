import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  insertFiscalDocument,
  insertOfflineFiscalDocument,
  insertDeferredSale,
  OFFLINE_POINT_OF_SALE,
  POINT_OF_SALE,
} from "../fiscal/test-support/real-time-authorization-database";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteReturnSaleReader } from "./sqlite-return-sale-reader";
import {
  insertBranchSettings,
  insertStoredRefund,
  insertStoredReturn,
  openSoldSaleDatabase,
  SOLD_AT,
} from "./test-support/sold-sale-database";

let database: LocalDatabase;
let reader: SqliteReturnSaleReader;

beforeEach(() => {
  database = openSoldSaleDatabase();
  reader = new SqliteReturnSaleReader(database);
});

afterEach(() => {
  database.close();
});

describe("the sale a return starts from", () => {
  it("is the sale itself, with its lines, when searched by its id", () => {
    const found = reader.saleForReturn({ kind: "sale", saleId: "sale-1" });

    expect(found).toMatchObject({
      sale: { id: "sale-1", state: "COMPLETED", sessionId: "session-1" },
      occurredAt: new Date(SOLD_AT),
      invoice: null,
      returned: [],
    });
    expect(found?.sale.lines.map(({ id, promotionId }) => ({ id, promotionId }))).toEqual([
      { id: "line-1", promotionId: null },
      { id: "line-2", promotionId: "two-for-one" },
    ]);
  });

  it("is none for a sale the register does not hold", () => {
    expect(reader.saleForReturn({ kind: "sale", saleId: "missing" })).toBeUndefined();
  });

  it("is found by the point of sale and number of its authorized invoice, which it then names", () => {
    insertFiscalDocument(database, { state: "AUTHORIZED", number: 41 });

    expect(
      reader.saleForReturn({ kind: "invoice", pointOfSale: POINT_OF_SALE, number: 41 }),
    ).toMatchObject({
      sale: { id: "sale-1" },
      invoice: { pointOfSale: POINT_OF_SALE, number: 41 },
    });
  });

  it.each(["REJECTED", "UNKNOWN", "RELEASED"] as const)(
    "is not found by the number of an invoice that is %s",
    (state) => {
      insertFiscalDocument(database, { state, number: 41 });

      expect(
        reader.saleForReturn({ kind: "invoice", pointOfSale: POINT_OF_SALE, number: 41 }),
      ).toBeUndefined();
    },
  );

  it("is not found by another number or another point of sale", () => {
    insertFiscalDocument(database, { state: "AUTHORIZED", number: 41 });

    expect(
      reader.saleForReturn({ kind: "invoice", pointOfSale: POINT_OF_SALE, number: 42 }),
    ).toBeUndefined();
    expect(
      reader.saleForReturn({ kind: "invoice", pointOfSale: POINT_OF_SALE + 1, number: 41 }),
    ).toBeUndefined();
  });

  it("is found by the number of an invoice generated offline", () => {
    insertOfflineFiscalDocument(database, { number: 7 });

    expect(
      reader.saleForReturn({ kind: "invoice", pointOfSale: OFFLINE_POINT_OF_SALE, number: 7 }),
    ).toMatchObject({
      sale: { id: "sale-1" },
      invoice: { pointOfSale: OFFLINE_POINT_OF_SALE, number: 7 },
    });
  });

  it("is found by the id and short code of its deferred sale, with no invoice yet", () => {
    const { id, shortCode } = insertDeferredSale(database, "sale-1");

    expect(reader.saleForReturn({ kind: "deferred", id, shortCode })).toMatchObject({
      sale: { id: "sale-1" },
      invoice: null,
    });
  });

  it("is not found by a deferred sale's id with another short code", () => {
    const { id } = insertDeferredSale(database, "sale-1");

    expect(reader.saleForReturn({ kind: "deferred", id, shortCode: "22222222" })).toBeUndefined();
  });

  it("carries the payments with what each already gave back, by void, cancellation or return", () => {
    insertStoredReturn(database, "return-1", [
      { saleLineId: "line-1", quantity: 1, refundedAmount: 2500 },
    ]);
    insertStoredRefund(database, {
      id: "refund-1",
      paymentId: "pay-cash",
      method: "CASH",
      amount: 1000,
    });
    insertStoredRefund(database, {
      id: "refund-2",
      paymentId: "pay-cash",
      method: "CASH",
      amount: 1500,
    });

    const found = reader.saleForReturn({ kind: "sale", saleId: "sale-1" });

    expect(
      found?.payments.map(({ id, method, provider, amount, state, refundedAmount }) => ({
        id,
        method,
        provider,
        amount,
        state,
        refundedAmount,
      })),
    ).toEqual([
      {
        id: "pay-cash",
        method: "CASH",
        provider: "NONE",
        amount: 6000,
        state: "APPROVED",
        refundedAmount: 2500,
      },
      {
        id: "pay-transfer",
        method: "TRANSFER",
        provider: "NONE",
        amount: 5500,
        state: "APPROVED",
        refundedAmount: 0,
      },
    ]);
  });

  it("carries what each line already returned and was refunded across every earlier return", () => {
    insertStoredReturn(database, "return-1", [
      { saleLineId: "line-1", quantity: 1, refundedAmount: 2500 },
      { saleLineId: "line-2", quantity: 4, refundedAmount: 4000 },
    ]);
    insertStoredReturn(database, "return-2", [
      { saleLineId: "line-1", quantity: 1, refundedAmount: 2500 },
    ]);

    expect(reader.saleForReturn({ kind: "sale", saleId: "sale-1" })?.returned).toEqual([
      { saleLineId: "line-1", quantity: 2, refundedAmount: 5000 },
      { saleLineId: "line-2", quantity: 4, refundedAmount: 4000 },
    ]);
  });
});

describe("the days a good-condition return is accepted", () => {
  it("are the branch setting", () => {
    insertBranchSettings(database, 30);

    expect(reader.goodConditionReturnDays()).toBe(30);
  });

  it("are the default while the register holds no branch settings", () => {
    expect(reader.goodConditionReturnDays()).toBe(15);
  });
});

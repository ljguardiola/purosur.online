import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, paymentRefunds, paymentTransactions } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { openSurplusRefundOfRebuiltSale } from "./open-surplus-refund-of-rebuilt-sale.js";
import {
  insertRegister,
  insertSyncedSaleHolding,
  pendingPointTransaction,
  pendingTransaction,
} from "./test-support/payment-transaction-fixtures.js";

const OPENED_AT = new Date("2026-10-12T10:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function paidOrderRebuiltIntoSale(
  build: typeof pendingTransaction | typeof pendingPointTransaction = pendingTransaction,
) {
  const registerId = await insertRegister(db, "Caja 1");
  const transaction = build(registerId, { state: "APPROVED", amount: 3000 });
  await db.insert(paymentTransactions).values(transaction);
  const rebuiltSaleId = crypto.randomUUID();
  await insertSyncedSaleHolding(db, transaction, "APPROVED", {
    saleId: rebuiltSaleId,
    amount: 2400,
  });
  return { transaction, rebuiltSaleId };
}

describe("openSurplusRefundOfRebuiltSale", () => {
  it("opens one pending late-payment refund of the surplus, of the rebuilt sale and not of the sale the order was created for", async () => {
    const { transaction, rebuiltSaleId } = await paidOrderRebuiltIntoSale();

    const opening = await openSurplusRefundOfRebuiltSale(
      db,
      { paymentTransactionId: transaction.id, amount: 600 },
      OPENED_AT,
    );

    expect(opening).toBe("opened");
    expect(await db.select().from(paymentRefunds)).toEqual([
      expect.objectContaining({
        saleId: rebuiltSaleId,
        paymentId: null,
        paymentTransactionId: transaction.id,
        originEventId: null,
        providerOrderId: null,
        origin: "late_payment",
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 600,
        state: "PENDING",
        occurredAt: OPENED_AT,
      }),
    ]);
  });

  it("opens the refund task alert of the surplus for the register's branch", async () => {
    const { transaction, rebuiltSaleId } = await paidOrderRebuiltIntoSale();

    await openSurplusRefundOfRebuiltSale(
      db,
      { paymentTransactionId: transaction.id, amount: 600 },
      OPENED_AT,
    );

    const [refund] = await db.select().from(paymentRefunds);
    expect(await db.select().from(alerts)).toEqual([
      expect.objectContaining({
        kind: "late_payment_refund",
        scope: refund?.id,
        detail: {
          saleId: rebuiltSaleId,
          amount: 600,
          providerOrderId: null,
          method: "QR",
          ofRebuiltSale: true,
        },
      }),
    ]);
  });

  it("opens the surplus refund of a Point order by its channel", async () => {
    const { transaction } = await paidOrderRebuiltIntoSale(pendingPointTransaction);

    await openSurplusRefundOfRebuiltSale(
      db,
      { paymentTransactionId: transaction.id, amount: 600 },
      OPENED_AT,
    );

    expect(await db.select().from(paymentRefunds)).toEqual([
      expect.objectContaining({ method: "POINT", provider: "MERCADOPAGO_POINT", amount: 600 }),
    ]);
  });

  it("opens the refund and its alert once when the sale is applied again", async () => {
    const { transaction } = await paidOrderRebuiltIntoSale();
    const surplus = { paymentTransactionId: transaction.id, amount: 600 };

    const first = await openSurplusRefundOfRebuiltSale(db, surplus, OPENED_AT);
    const second = await openSurplusRefundOfRebuiltSale(db, surplus, OPENED_AT);

    expect([first, second]).toEqual(["opened", "already_open"]);
    expect(await db.select().from(paymentRefunds)).toHaveLength(1);
    expect(await db.select().from(alerts)).toHaveLength(1);
  });

  it("refuses a payment transaction nobody recorded", async () => {
    const id = crypto.randomUUID();

    await expect(
      openSurplusRefundOfRebuiltSale(db, { paymentTransactionId: id, amount: 600 }, OPENED_AT),
    ).rejects.toThrow(`payment transaction ${id} is not recorded`);
  });
});

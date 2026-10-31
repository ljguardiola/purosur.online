import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentRefunds } from "../platform/db/schema.js";
import { BACKOFFICE_ORIGIN, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { openSurplusRefundOfRebuiltSale } from "./open-surplus-refund-of-rebuilt-sale.js";
import { registerRefundRoutes } from "./refund-routes.js";
import { FakeMercadoPagoOrders, ORDER_ID } from "./test-support/fake-mercado-pago-orders.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";
import { aPendingQrRefundOfCancelledSale } from "./test-support/mercado-pago-refund-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let mercadoPago: FakeMercadoPagoOrders;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  mercadoPago = new FakeMercadoPagoOrders();
  app = Fastify();
  registerRefundRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
    sending: { mercadoPago, connections: { withConnection: (work) => work(db) } },
  });
});

afterEach(async () => {
  await app.close();
});

function confirm(headers: Record<string, string>, refundId: string) {
  return app.inject({ method: "POST", url: `/refunds/${refundId}/confirmation`, headers });
}

async function storedRefund(refundId: string) {
  const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
  return refund;
}

describe("sending the refunds of a paid order a sale was rebuilt against", () => {
  it("asks Mercado Pago for only the applied amount when the cancelled sale held less than the order", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingQrRefundOfCancelledSale(db, {
      cancelledAt: NOW,
      amount: 2400,
      transactionAmount: 3000,
      rebuiltSaleId: crypto.randomUUID(),
    });

    const response = await confirm(headers, pending.refundId);

    expect(response.statusCode).toBe(200);
    const refund = await storedRefund(pending.refundId);
    expect(mercadoPago.refunds).toEqual([
      { orderId: ORDER_ID, idempotencyKey: refund?.attemptKey, amount: 2400 },
    ]);
  });

  it("gives the customer back the order's amount once between the cancelled sale's refund and the surplus refund", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const rebuiltSaleId = crypto.randomUUID();
    const cancelled = await aPendingQrRefundOfCancelledSale(db, {
      cancelledAt: NOW,
      amount: 2400,
      transactionAmount: 3000,
      rebuiltSaleId,
    });
    await openSurplusRefundOfRebuiltSale(
      db,
      { paymentTransactionId: cancelled.transactionId, amount: 600 },
      NOW,
    );
    const [surplus] = (await db.select().from(paymentRefunds)).filter(
      (refund) => refund.origin === "late_payment",
    );
    if (!surplus) {
      throw new Error("test setup: the surplus refund was not opened");
    }

    const cancelledResponse = await confirm(headers, cancelled.refundId);
    const surplusResponse = await confirm(headers, surplus.id);

    expect([cancelledResponse.statusCode, surplusResponse.statusCode]).toEqual([200, 200]);
    expect(mercadoPago.refunds.map((refund) => refund.amount)).toEqual([2400, 600]);
  });

  it("refuses a surplus refund that would take the order past what it holds after the cancelled sale was refunded in full", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const cancelled = await aPendingQrRefundOfCancelledSale(db, {
      cancelledAt: NOW,
      amount: 3000,
      rebuiltSaleId: crypto.randomUUID(),
    });
    await openSurplusRefundOfRebuiltSale(
      db,
      { paymentTransactionId: cancelled.transactionId, amount: 600 },
      NOW,
    );
    const [surplus] = (await db.select().from(paymentRefunds)).filter(
      (refund) => refund.origin === "late_payment",
    );

    const response = await confirm(headers, surplus?.id ?? "");

    expect(response.statusCode).toBe(409);
    expect(mercadoPago.refunds).toEqual([]);
  });
});

describe("sending a late-payment refund below its payment", () => {
  it("asks Mercado Pago for only the refund's amount", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingLatePaymentRefund(db, {
      openedAt: NOW,
      amount: 3000,
      refundAmount: 600,
      orderId: ORDER_ID,
    });

    const response = await confirm(headers, pending.refundId);

    expect(response.statusCode).toBe(200);
    const refund = await storedRefund(pending.refundId);
    expect(mercadoPago.refunds).toEqual([
      { orderId: ORDER_ID, idempotencyKey: refund?.attemptKey, amount: 600 },
    ]);
  });
});

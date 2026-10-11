import { randomUUID } from "node:crypto";
import { latePaymentRefund, latePaymentRefundOfUnrecordedOrder } from "@purosur/domain";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alerts, paymentRefunds, paymentTransactions } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { openLatePaymentRefund } from "./open-late-payment-refund.js";
import { NOW } from "./test-support/fake-mercado-pago-orders.js";
import { pendingTransaction } from "./test-support/payment-transaction-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("open_late_payment_refund");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function aPayment() {
  const { registerId } = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName: `Caja ${randomUUID()}`,
  });
  const transaction = pendingTransaction(registerId, { providerOrderId: randomUUID() });
  await db.insert(paymentTransactions).values(transaction);
  return transaction;
}

async function refundsAndAlertsOf(paymentTransactionId: string) {
  const refunds = (await db.select().from(paymentRefunds)).filter(
    (refund) => refund.paymentTransactionId === paymentTransactionId,
  );
  const scopes = new Set(refunds.map((refund) => refund.id));
  const openedAlerts = (await db.select().from(alerts)).filter((alert) => scopes.has(alert.scope));
  return { refunds, openedAlerts };
}

describe("openLatePaymentRefund", () => {
  it("opens one task for a payment, whatever the number of times it is asked, when it names no order", async () => {
    const payment = await aPayment();
    const refund = latePaymentRefund(payment);

    expect(await openLatePaymentRefund(db, refund, NOW)).toBe("opened");
    expect(await openLatePaymentRefund(db, refund, NOW)).toBe("already_open");

    const { refunds, openedAlerts } = await refundsAndAlertsOf(payment.id);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.providerOrderId).toBeNull();
    expect(openedAlerts).toHaveLength(1);
  });

  it("opens a task and an alert for each order the payment's reference is on", async () => {
    const payment = await aPayment();

    const first = await openLatePaymentRefund(
      db,
      latePaymentRefundOfUnrecordedOrder(payment, "order-2", 4200),
      NOW,
    );
    const second = await openLatePaymentRefund(
      db,
      latePaymentRefundOfUnrecordedOrder(payment, "order-3", 4300),
      NOW,
    );

    expect([first, second]).toEqual(["opened", "opened"]);
    const { refunds, openedAlerts } = await refundsAndAlertsOf(payment.id);
    expect(
      refunds
        .map(({ providerOrderId, amount }) => ({ providerOrderId, amount }))
        .sort((a, b) => (a.providerOrderId ?? "").localeCompare(b.providerOrderId ?? "")),
    ).toEqual([
      { providerOrderId: "order-2", amount: 4200 },
      { providerOrderId: "order-3", amount: 4300 },
    ]);
    expect(openedAlerts).toHaveLength(2);
  });

  it("opens one task for the same order however many times it is asked", async () => {
    const payment = await aPayment();
    const refund = latePaymentRefundOfUnrecordedOrder(payment, "order-2", 4200);

    expect(await openLatePaymentRefund(db, refund, NOW)).toBe("opened");
    expect(await openLatePaymentRefund(db, refund, NOW)).toBe("already_open");

    const { refunds, openedAlerts } = await refundsAndAlertsOf(payment.id);
    expect(refunds).toHaveLength(1);
    expect(openedAlerts).toHaveLength(1);
  });

  it("keeps the task of the order the payment recorded apart from the tasks of other orders", async () => {
    const payment = await aPayment();

    expect(await openLatePaymentRefund(db, latePaymentRefund(payment), NOW)).toBe("opened");
    expect(
      await openLatePaymentRefund(
        db,
        latePaymentRefundOfUnrecordedOrder(payment, "order-2", 4200),
        NOW,
      ),
    ).toBe("opened");

    expect((await refundsAndAlertsOf(payment.id)).refunds).toHaveLength(2);
  });
});

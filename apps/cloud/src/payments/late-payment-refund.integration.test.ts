import { randomUUID } from "node:crypto";
import { latePaymentRefund } from "@purosur/domain";
import {
  checkPendingMercadoPagoPayments,
  type MercadoPagoOrderReading,
} from "@purosur/domain/payments/use-cases";
import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paymentRefunds, paymentTransactions } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { DrizzleEventApplication } from "../sync/drizzle-event-application.js";
import { unappliedEventOf } from "../sync/test-support/unapplied-event.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzlePaymentTransactionDirectory } from "./drizzle-payment-transaction-directory.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";
import {
  FakeMercadoPagoOrders,
  NOW,
  ORDER_ID,
  PAID_ORDER,
} from "./test-support/fake-mercado-pago-orders.js";
import { pendingTransaction } from "./test-support/payment-transaction-fixtures.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("late_payment_refund");
  sql = postgres(integrationDb.databaseUrl, { max: 12 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

class GatedMercadoPago extends FakeMercadoPagoOrders {
  private openGate: () => void = () => {};
  private readonly gate = new Promise<void>((resolve) => {
    this.openGate = resolve;
  });
  private announceRead: () => void = () => {};
  readonly readStarted = new Promise<void>((resolve) => {
    this.announceRead = resolve;
  });

  override async readOrder(orderId: string): Promise<MercadoPagoOrderReading> {
    const reading = await super.readOrder(orderId);
    this.announceRead();
    await this.gate;
    return reading;
  }

  release(): void {
    this.openGate();
  }
}

async function aPendingPayment(providerOrderId: string) {
  const { deviceId, registerId } = await insertEnrolledInstallation(db, {
    now: NOW,
    registerName: `Caja ${randomUUID()}`,
  });
  const transaction = pendingTransaction(registerId, { providerOrderId });
  await db.insert(paymentTransactions).values(transaction);
  return { transaction, deviceId };
}

function checkPending(mercadoPago: FakeMercadoPagoOrders) {
  return checkPendingMercadoPagoPayments({
    directory: new DrizzlePaymentTransactionDirectory(db),
    lanes: new DrizzlePaymentTransactionLanes(postgresDedicatedConnections(sql)),
    mercadoPago,
    cancellationKeys: { newCancellationKey: () => randomUUID() },
    clock: { now: () => NOW },
  });
}

function paidMercadoPago(): FakeMercadoPagoOrders {
  const mercadoPago = new FakeMercadoPagoOrders();
  mercadoPago.reading = { kind: "read", result: PAID_ORDER };
  return mercadoPago;
}

function gatedPaidMercadoPago(): GatedMercadoPago {
  const mercadoPago = new GatedMercadoPago();
  mercadoPago.reading = { kind: "read", result: PAID_ORDER };
  return mercadoPago;
}

async function applyReplacement(
  transaction: { id: string; saleId: string },
  deviceId: string,
): Promise<void> {
  const fact: SyncedFact = {
    kind: "qr_payment_replaced",
    replacement: { paymentTransactionId: transaction.id, saleId: transaction.saleId },
  };
  const event = unappliedEventOf(
    {
      event_id: randomUUID(),
      device_seq: 1,
      aggregate_type: "Sale",
      aggregate_id: transaction.saleId,
      event_type: "qr_payment_replaced",
      schema_version: 1,
      payload: {},
      occurred_at: NOW.toISOString(),
      actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
      chain_hmac: "hmac",
    },
    { deviceId },
  );
  await new DrizzleEventApplication(db, () => NOW).transaction((tx) => tx.record(fact, event));
}

async function tasksAndAlertsOf(paymentTransactionId: string) {
  const refunds = await sql<{ id: string }[]>`
    select id from payment_refunds where payment_transaction_id = ${paymentTransactionId}`;
  const opened = await sql<{ id: string }[]>`
    select id from alerts where kind = 'late_payment_refund'
      and scope in (select id::text from payment_refunds where payment_transaction_id = ${paymentTransactionId})`;
  return { refunds: refunds.length, alerts: opened.length };
}

describe("the refund task of a late payment on a real Postgres", () => {
  it("opens one task and one alert when the replacement lands while the lane is reading the provider", async () => {
    const { transaction, deviceId } = await aPendingPayment("ORD-LANDS-DURING-READ");
    const mercadoPago = gatedPaidMercadoPago();

    const checking = checkPending(mercadoPago);
    await mercadoPago.readStarted;
    await applyReplacement(transaction, deviceId);
    mercadoPago.release();
    await checking;

    expect(await tasksAndAlertsOf(transaction.id)).toEqual({ refunds: 1, alerts: 1 });
  });

  it("opens one task and one alert when the approval was recorded before the replacement was applied", async () => {
    const { transaction, deviceId } = await aPendingPayment("ORD-APPROVED-FIRST");

    await checkPending(paidMercadoPago());
    expect(await tasksAndAlertsOf(transaction.id)).toEqual({ refunds: 0, alerts: 0 });
    await applyReplacement(transaction, deviceId);

    expect(await tasksAndAlertsOf(transaction.id)).toEqual({ refunds: 1, alerts: 1 });
  });

  it("opens one task and one alert per payment however the approval and the replacement interleave", async () => {
    const rounds = await Promise.all(
      Array.from({ length: 8 }, async (_unused, round) => {
        const { transaction, deviceId } = await aPendingPayment(`ORD-RACE-${round}`);
        await Promise.all([
          checkPending(paidMercadoPago()),
          applyReplacement(transaction, deviceId),
        ]);
        return tasksAndAlertsOf(transaction.id);
      }),
    );

    expect(rounds).toEqual(Array.from({ length: 8 }, () => ({ refunds: 1, alerts: 1 })));
  });

  it("opens one task and one alert when the lane reports the same approval twice at once", async () => {
    const { transaction } = await aPendingPayment(ORDER_ID);
    await sql`update payment_transactions set state = 'APPROVED', replaced = true where id = ${transaction.id}`;
    const lanes = new DrizzlePaymentTransactionLanes(postgresDedicatedConnections(sql));
    const report = () =>
      lanes.inPaymentTransactionLane(transaction.id, (lane) =>
        lane.inOneTransaction(async (atomic) => {
          await atomic.recordOrderResult(
            transaction.id,
            { state: "APPROVED", needsReview: false },
            NOW,
          );
          return atomic.openLatePaymentRefund(latePaymentRefund(transaction), NOW);
        }),
      );

    const openings = await Promise.all([report(), report()]);

    expect(openings.slice().sort()).toEqual(["already_open", "opened"]);
    expect(await tasksAndAlertsOf(transaction.id)).toEqual({ refunds: 1, alerts: 1 });
  });

  it("refuses a second task of the same payment transaction at the database", async () => {
    const { transaction } = await aPendingPayment("ORD-UNIQUE");
    const insertTask = () =>
      db.insert(paymentRefunds).values({
        id: randomUUID(),
        saleId: transaction.saleId,
        paymentTransactionId: transaction.id,
        origin: "late_payment",
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: transaction.amount,
        state: "PENDING",
        occurredAt: NOW,
      });
    await insertTask();

    await expect(insertTask()).rejects.toThrow();
  });
});

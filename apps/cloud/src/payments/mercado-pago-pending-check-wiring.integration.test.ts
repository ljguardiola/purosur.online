import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AccessEmailSender } from "../credentials/recovery-email-sender.js";
import { paymentTransactions } from "../platform/db/schema.js";
import { setUpRecovery } from "../server.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER } from "./mercado-pago-pending-check-task.js";
import {
  FakeMercadoPagoOrders,
  ORDER_ID,
  PAID_ORDER,
} from "./test-support/mercado-pago-qr-under-test.js";
import { insertRegister, pendingTransaction } from "./test-support/payment-transaction-fixtures.js";

const UNUSED_EMAIL_SENDER: AccessEmailSender = {
  async sendRecoveryLink() {},
  async sendFirstPinCode() {},
};

const WATCHDOG_TASK_IDENTIFIER = "mercado-pago-pending-check-watchdog";
const CHECKED_AT = new Date("2126-01-01T00:00:00.000Z");
const NEXT_CHECK_AT = new Date("2126-01-01T00:00:30.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("mercado_pago_pending_check_wiring");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function scheduledChecks() {
  return sql<{ runAt: Date }[]>`
    select j.run_at as "runAt"
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER}
      and j.key = ${MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER}
  `;
}

function pendingWatchdogs() {
  return sql`
    select 1
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${WATCHDOG_TASK_IDENTIFIER}
  `;
}

function setUp(mercadoPago: FakeMercadoPagoOrders) {
  return setUpRecovery(
    {
      databaseUrl: integrationDb.databaseUrl,
      emailSender: { transport: "log" },
      emailFrom: "Puro Sur <acceso@mail.staging.purosur.online>",
      emailReplyTo: "purosur.comarca@gmail.com",
      backofficeOrigin: "https://staging.purosur.online",
      arcaCertificate: { environment: "production", notAfter: new Date("2126-09-01T19:42:17Z") },
      arcaVitality: { endpoint: "http://127.0.0.1:1/unused" },
      mercadoPago,
    },
    () => CHECKED_AT,
    { emailSender: UNUSED_EMAIL_SENDER },
  );
}

async function seedPendingPayment() {
  const db = drizzle(sql);
  const registerId = await insertRegister(db, "Caja 1");
  const payment = pendingTransaction(registerId, { providerOrderId: ORDER_ID });
  await db.insert(paymentTransactions).values(payment);
  return payment;
}

describe("the Mercado Pago pending check the server sets up on a real Postgres", () => {
  it("approves a payment whose notification never arrived and keeps exactly one next check scheduled 30 seconds on, which the watchdog does not duplicate", async () => {
    const payment = await seedPendingPayment();
    const mercadoPago = new FakeMercadoPagoOrders();
    mercadoPago.reading = { kind: "read", result: PAID_ORDER };
    const recovery = await setUp(mercadoPago);
    try {
      await recovery.workerUtils.addJob(
        MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
        {},
        { jobKey: MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER },
      );

      await vi.waitFor(
        async () => {
          const rows = await sql<{ state: string }[]>`
            select state from payment_transactions where id = ${payment.id}`;
          const scheduled = await scheduledChecks();
          expect(rows).toEqual([{ state: "APPROVED" }]);
          expect(scheduled).toHaveLength(1);
          expect(scheduled[0]?.runAt).toEqual(NEXT_CHECK_AT);
        },
        { timeout: 20_000, interval: 100 },
      );

      await recovery.workerUtils.addJob(WATCHDOG_TASK_IDENTIFIER, {});
      await vi.waitFor(async () => expect(await pendingWatchdogs()).toHaveLength(0), {
        timeout: 20_000,
        interval: 100,
      });

      expect(await scheduledChecks()).toEqual([{ runAt: NEXT_CHECK_AT }]);
    } finally {
      await recovery.close();
    }
  }, 90_000);

  it("has the watchdog start the chain when none is scheduled", async () => {
    await sql`delete from graphile_worker._private_jobs`;
    const recovery = await setUp(new FakeMercadoPagoOrders());
    try {
      await recovery.workerUtils.addJob(WATCHDOG_TASK_IDENTIFIER, {});

      await vi.waitFor(async () => expect(await scheduledChecks()).toHaveLength(1), {
        timeout: 20_000,
        interval: 100,
      });
    } finally {
      await recovery.close();
    }
  }, 90_000);
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { paymentTransactions } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
  MERCADO_PAGO_PENDING_CHECK_WATCHDOG_TASK_IDENTIFIER,
  mercadoPagoPendingCheckJobs,
} from "./mercado-pago-pending-check-task.js";
import {
  FakeMercadoPagoOrders,
  NOW,
  ORDER_ID,
  PAID_ORDER,
} from "./test-support/fake-mercado-pago-orders.js";
import { insertRegister, pendingTransaction } from "./test-support/payment-transaction-fixtures.js";

const NEXT_CHECK_AT = new Date(NOW.getTime() + 30_000);

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function jobsOf(mercadoPago = new FakeMercadoPagoOrders(), check?: () => Promise<unknown>) {
  return mercadoPagoPendingCheckJobs(
    {
      now: () => NOW,
      mercadoPago,
      db: testDatabase.db,
      connections: { withConnection: (work) => work(testDatabase.db) },
    },
    check ? { check } : {},
  );
}

function taskOf(jobs: ReturnType<typeof jobsOf>, identifier: string) {
  const task = jobs.taskList[identifier];
  if (!task) {
    throw new Error(`test setup: expected the registered task ${identifier}`);
  }
  return task;
}

describe("mercadoPagoPendingCheckJobs", () => {
  it("registers the check and its watchdog, and runs the watchdog every minute", () => {
    const jobs = jobsOf();

    expect(jobs.taskList[MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER]).toBeInstanceOf(Function);
    expect(jobs.taskList[MERCADO_PAGO_PENDING_CHECK_WATCHDOG_TASK_IDENTIFIER]).toBeInstanceOf(
      Function,
    );
    expect(jobs.crontab).toEqual(["* * * * * mercado-pago-pending-check-watchdog"]);
  });

  it("re-reads from Mercado Pago the orders of the pending payments and applies what it answers", async () => {
    const registerId = await insertRegister(testDatabase.db, "Caja 1");
    const payment = pendingTransaction(registerId, { providerOrderId: ORDER_ID });
    await testDatabase.db.insert(paymentTransactions).values(payment);
    const mercadoPago = new FakeMercadoPagoOrders();
    mercadoPago.reading = { kind: "read", result: PAID_ORDER };
    const { helpers } = buildJobHelpers();

    await taskOf(jobsOf(mercadoPago), MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER)({}, helpers);

    expect(mercadoPago.readings).toEqual([ORDER_ID]);
    const [row] = await testDatabase.db.select().from(paymentTransactions);
    expect(row?.state).toBe("APPROVED");
  });

  it("schedules the next check 30 seconds on, replacing any check already scheduled under its key", async () => {
    const { helpers, addJob } = buildJobHelpers();

    await taskOf(jobsOf(), MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER)({}, helpers);

    expect(addJob).toHaveBeenCalledWith(
      MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
      {},
      {
        jobKey: MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
        jobKeyMode: "replace",
        runAt: NEXT_CHECK_AT,
      },
    );
  });

  it("schedules the next check even when this one failed", async () => {
    const { helpers, addJob } = buildJobHelpers();
    const jobs = jobsOf(undefined, vi.fn().mockRejectedValue(new Error("store down")));

    await expect(
      taskOf(jobs, MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER)({}, helpers),
    ).rejects.toThrow("store down");

    expect(addJob).toHaveBeenCalledTimes(1);
  });

  it("has the watchdog add the check under the same key, keeping the run time of one already scheduled", async () => {
    const { helpers, addJob } = buildJobHelpers();

    await taskOf(jobsOf(), MERCADO_PAGO_PENDING_CHECK_WATCHDOG_TASK_IDENTIFIER)({}, helpers);

    expect(addJob).toHaveBeenCalledWith(
      MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
      {},
      {
        jobKey: MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
        jobKeyMode: "preserve_run_at",
      },
    );
  });
});

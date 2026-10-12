import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentTransactions } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { buildJobHelpers } from "../test-support/job-helpers.js";
import {
  MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER,
  mercadoPagoPendingCheckJobs,
} from "./mercado-pago-pending-check-task.js";
import { clientAnsweringOrder } from "./test-support/client-answering-order.js";
import { NOW, ORDER_ID } from "./test-support/fake-mercado-pago-orders.js";
import { pointPaidWithCardOrder } from "./test-support/mercado-pago-documented-orders.js";
import {
  insertRegister,
  pendingPointTransaction,
} from "./test-support/payment-transaction-fixtures.js";

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

describe("the pending check of a payment on the integrated terminal", () => {
  it("approves the pending payment of an order paid on the terminal", async () => {
    const registerId = await insertRegister(testDatabase.db, "Caja 1");
    const payment = pendingPointTransaction(registerId, { providerOrderId: ORDER_ID });
    await testDatabase.db.insert(paymentTransactions).values(payment);
    const jobs = mercadoPagoPendingCheckJobs({
      now: () => NOW,
      mercadoPago: clientAnsweringOrder(pointPaidWithCardOrder()),
      db: testDatabase.db,
      connections: { withConnection: (work) => work(testDatabase.db) },
    });

    await jobs.taskList[MERCADO_PAGO_PENDING_CHECK_TASK_IDENTIFIER]?.(
      {},
      buildJobHelpers().helpers,
    );

    const [row] = await testDatabase.db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, payment.id));
    expect(row).toMatchObject({
      state: "APPROVED",
      method: "POINT",
      provider: "MERCADOPAGO_POINT",
    });
  });
});

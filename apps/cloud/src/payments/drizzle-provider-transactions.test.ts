import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentTransactions } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { providerTransactionOfPayment } from "./drizzle-provider-transactions.js";
import { insertRegister, pendingTransaction } from "./test-support/payment-transaction-fixtures.js";

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

describe("providerTransactionOfPayment", () => {
  it("finds the sale, amount and state the cloud recorded for a payment", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const transaction = pendingTransaction(registerId, { state: "APPROVED", amount: 30_700 });
    await db.insert(paymentTransactions).values([transaction, pendingTransaction(registerId)]);

    expect(await providerTransactionOfPayment(db, transaction.id)).toEqual({
      saleId: transaction.saleId,
      amount: 30_700,
      state: "APPROVED",
    });
  });

  it("answers nothing for a payment the cloud has no record of", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    await db.insert(paymentTransactions).values(pendingTransaction(registerId));

    expect(
      await providerTransactionOfPayment(db, "019a0000-0000-7000-8000-0000000000ff"),
    ).toBeNull();
  });
});

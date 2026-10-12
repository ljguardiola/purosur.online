import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentTransactions } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePaymentTransactionDirectory } from "./drizzle-payment-transaction-directory.js";
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

const directory = () => new DrizzlePaymentTransactionDirectory(db);

describe("DrizzlePaymentTransactionDirectory.paymentTransactionOfOrder", () => {
  it("finds the payment transaction and its register by the provider's order id", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const transaction = pendingTransaction(registerId, { providerOrderId: "ORD01ABC" });
    await db.insert(paymentTransactions).values([transaction, pendingTransaction(registerId)]);

    expect(await directory().paymentTransactionOfOrder("ORD01ABC")).toEqual({
      id: transaction.id,
      registerId,
    });
  });

  it("finds it whatever the letter case of the order id it is asked with", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const transaction = pendingTransaction(registerId, { providerOrderId: "ORD01ABC" });
    await db.insert(paymentTransactions).values(transaction);

    expect(await directory().paymentTransactionOfOrder("ord01abc")).toEqual({
      id: transaction.id,
      registerId,
    });
  });

  it("answers nothing for an order no payment transaction has", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    await db
      .insert(paymentTransactions)
      .values(pendingTransaction(registerId, { providerOrderId: "ORD01ABC" }));

    expect(await directory().paymentTransactionOfOrder("ORD02XYZ")).toBeNull();
  });
});

describe("DrizzlePaymentTransactionDirectory.pendingPaymentTransactions", () => {
  it("lists every pending payment transaction, with or without an order, and no other", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const withOrder = pendingTransaction(registerId, { providerOrderId: "ORD01" });
    const withoutOrder = pendingTransaction(registerId);
    await db
      .insert(paymentTransactions)
      .values([
        withOrder,
        withoutOrder,
        pendingTransaction(registerId, { state: "APPROVED", providerOrderId: "ORD02" }),
        pendingTransaction(registerId, { state: "EXPIRED" }),
      ]);

    const pending = await directory().pendingPaymentTransactions();

    expect(pending).toHaveLength(2);
    expect(pending).toEqual(
      expect.arrayContaining([
        { id: withOrder.id, registerId },
        { id: withoutOrder.id, registerId },
      ]),
    );
  });
});

describe("DrizzlePaymentTransactionDirectory.anyPaymentTransactionMayHaveUnrecordedOrder", () => {
  it("holds when a pending transaction without an order has an unknown creation outcome", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    await db
      .insert(paymentTransactions)
      .values(pendingTransaction(registerId, { creationOutcomeUnknown: true }));

    expect(await directory().anyPaymentTransactionMayHaveUnrecordedOrder()).toBe(true);
  });

  it("holds when a settled transaction with an order has an unknown creation outcome", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    await db.insert(paymentTransactions).values(
      pendingTransaction(registerId, {
        creationOutcomeUnknown: true,
        providerOrderId: "ORD01",
        state: "APPROVED",
      }),
    );

    expect(await directory().anyPaymentTransactionMayHaveUnrecordedOrder()).toBe(true);
  });

  it("does not hold when every transaction's creation outcome is known", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    await db
      .insert(paymentTransactions)
      .values([
        pendingTransaction(registerId, { creationOutcomeUnknown: false, providerOrderId: "ORD01" }),
        pendingTransaction(registerId, { creationOutcomeUnknown: false, state: "EXPIRED" }),
        pendingTransaction(registerId, { creationOutcomeUnknown: false }),
      ]);

    expect(await directory().anyPaymentTransactionMayHaveUnrecordedOrder()).toBe(false);
  });
});

describe("DrizzlePaymentTransactionDirectory.paymentTransactionOfExternalReference", () => {
  it("finds the payment transaction whose id is the external reference", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const transaction = pendingTransaction(registerId);
    await db.insert(paymentTransactions).values([transaction, pendingTransaction(registerId)]);

    expect(await directory().paymentTransactionOfExternalReference(transaction.id)).toEqual({
      id: transaction.id,
      registerId,
    });
  });

  it("answers nothing for a reference that is no transaction's id, even one that is not an id at all", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    await db.insert(paymentTransactions).values(pendingTransaction(registerId));

    expect(await directory().paymentTransactionOfExternalReference(crypto.randomUUID())).toBeNull();
    expect(await directory().paymentTransactionOfExternalReference("not-an-id")).toBeNull();
  });
});

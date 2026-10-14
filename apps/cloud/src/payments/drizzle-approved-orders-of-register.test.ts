import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentTransactions } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleApprovedOrdersOfRegister } from "./drizzle-approved-orders-of-register.js";
import {
  insertRegister,
  insertSyncedSaleHolding,
  pendingPointTransaction,
  pendingTransaction,
} from "./test-support/payment-transaction-fixtures.js";

const SINCE = new Date("2026-10-10T12:00:00.000Z");

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

const orders = () => new DrizzleApprovedOrdersOfRegister(db);

describe("DrizzleApprovedOrdersOfRegister", () => {
  it("answers the register's approved orders with what the register needs to find its own", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const paid = pendingTransaction(registerId, {
      state: "APPROVED",
      createdAt: new Date("2026-10-12T09:00:00.000Z"),
    });
    await db.insert(paymentTransactions).values(paid);

    expect(await orders().approvedWithoutSaleSince(registerId, SINCE)).toEqual([
      {
        paymentTransactionId: paid.id,
        saleId: paid.saleId,
        method: "QR",
        provider: "MERCADOPAGO_QR",
        amount: 5000,
        createdAt: paid.createdAt,
      },
    ]);
  });

  it("answers an approved Point order with its method and provider", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    await db.insert(paymentTransactions).values(
      pendingPointTransaction(registerId, {
        state: "APPROVED",
        createdAt: new Date("2026-10-12T09:00:00.000Z"),
      }),
    );

    const [order] = await orders().approvedWithoutSaleSince(registerId, SINCE);

    expect([order?.method, order?.provider]).toEqual(["POINT", "MERCADOPAGO_POINT"]);
  });

  it("answers the oldest first", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const newer = pendingTransaction(registerId, {
      state: "APPROVED",
      createdAt: new Date("2026-10-12T09:00:00.000Z"),
    });
    const older = pendingTransaction(registerId, {
      state: "APPROVED",
      createdAt: new Date("2026-10-11T09:00:00.000Z"),
    });
    await db.insert(paymentTransactions).values([newer, older]);

    const answered = await orders().approvedWithoutSaleSince(registerId, SINCE);

    expect(answered.map((order) => order.paymentTransactionId)).toEqual([older.id, newer.id]);
  });

  it("leaves out an order that is not approved", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    for (const state of ["PENDING", "DECLINED", "CANCELLED", "EXPIRED"] as const) {
      await db.insert(paymentTransactions).values(
        pendingTransaction(registerId, {
          state,
          createdAt: new Date("2026-10-12T09:00:00.000Z"),
        }),
      );
    }

    expect(await orders().approvedWithoutSaleSince(registerId, SINCE)).toEqual([]);
  });

  it("leaves out an approved order that another order replaced", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    await db.insert(paymentTransactions).values(
      pendingTransaction(registerId, {
        state: "APPROVED",
        replaced: true,
        createdAt: new Date("2026-10-12T09:00:00.000Z"),
      }),
    );

    expect(await orders().approvedWithoutSaleSince(registerId, SINCE)).toEqual([]);
  });

  it("leaves out an approved order a sale the register synced holds approved", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const held = pendingTransaction(registerId, {
      state: "APPROVED",
      createdAt: new Date("2026-10-12T09:00:00.000Z"),
    });
    await db.insert(paymentTransactions).values(held);
    await insertSyncedSaleHolding(db, held, "APPROVED");

    expect(await orders().approvedWithoutSaleSince(registerId, SINCE)).toEqual([]);
  });

  it("keeps an approved order the sale the register synced holds as not approved", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const chargedAgain = pendingTransaction(registerId, {
      state: "APPROVED",
      createdAt: new Date("2026-10-12T09:00:00.000Z"),
    });
    await db.insert(paymentTransactions).values(chargedAgain);
    await insertSyncedSaleHolding(db, chargedAgain, "EXPIRED");

    const answered = await orders().approvedWithoutSaleSince(registerId, SINCE);

    expect(answered.map((order) => order.paymentTransactionId)).toEqual([chargedAgain.id]);
  });

  it("leaves out the orders of another register", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const otherRegisterId = await insertRegister(db, "Caja 2");
    await db.insert(paymentTransactions).values(
      pendingTransaction(otherRegisterId, {
        state: "APPROVED",
        createdAt: new Date("2026-10-12T09:00:00.000Z"),
      }),
    );

    expect(await orders().approvedWithoutSaleSince(registerId, SINCE)).toEqual([]);
  });

  it("includes an order created exactly when the window starts and leaves out an earlier one", async () => {
    const registerId = await insertRegister(db, "Caja 1");
    const atStart = pendingTransaction(registerId, { state: "APPROVED", createdAt: SINCE });
    const before = pendingTransaction(registerId, {
      state: "APPROVED",
      createdAt: new Date(SINCE.getTime() - 1),
    });
    await db.insert(paymentTransactions).values([atStart, before]);

    const answered = await orders().approvedWithoutSaleSince(registerId, SINCE);

    expect(answered.map((order) => order.paymentTransactionId)).toEqual([atStart.id]);
  });
});

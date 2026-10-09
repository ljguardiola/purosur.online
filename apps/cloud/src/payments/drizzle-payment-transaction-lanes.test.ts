import { PaymentTransactionAlreadyRecorded } from "@purosur/domain/payments/use-cases";
import { eq } from "drizzle-orm";
import type { PgliteQueryResultHKT } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentTransactions } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";
import { insertRegister, pendingTransaction } from "./test-support/payment-transaction-fixtures.js";

const READ_AT = new Date("2026-10-09T12:01:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let lanes: DrizzlePaymentTransactionLanes<PgliteQueryResultHKT>;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
  lanes = new DrizzlePaymentTransactionLanes({ withConnection: (work) => work(db) });
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function storedRow(id: string) {
  const [row] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id));
  return row;
}

describe("DrizzlePaymentTransactionLanes", () => {
  describe("the recorded transactions", () => {
    it("knows no transaction that was never recorded", async () => {
      const registerId = await insertRegister(db, "caja-1");

      const recorded = await lanes.inPaymentTransactionLane(crypto.randomUUID(), (lane) =>
        lane.recordedTransaction(registerId, crypto.randomUUID()),
      );

      expect(recorded).toBeNull();
    });

    it("keeps a pending transaction with every field it was recorded with", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { creationOutcomeUnknown: true });

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded).toEqual(transaction);
    });

    it("does not show a transaction to another register", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const otherRegisterId = await insertRegister(db, "caja-2");
      const transaction = pendingTransaction(registerId);

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        return lane.recordedTransaction(otherRegisterId, transaction.id);
      });

      expect(recorded).toBeNull();
    });

    it("refuses to record the same transaction twice with the error of the domain", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);
      await lanes.inPaymentTransactionLane(transaction.id, (lane) =>
        lane.recordPendingTransaction(transaction),
      );

      await expect(
        lanes.inPaymentTransactionLane(transaction.id, (lane) =>
          lane.recordPendingTransaction(transaction),
        ),
      ).rejects.toBeInstanceOf(PaymentTransactionAlreadyRecorded);
    });

    it("does not translate a failure that is not a repeated transaction", async () => {
      const unknownRegister = pendingTransaction(crypto.randomUUID());

      const failure = lanes.inPaymentTransactionLane(unknownRegister.id, (lane) =>
        lane.recordPendingTransaction(unknownRegister),
      );

      await expect(failure).rejects.toThrow();
      await expect(failure).rejects.not.toBeInstanceOf(PaymentTransactionAlreadyRecorded);
    });
  });

  describe("a creation attempt", () => {
    it("moves the transaction's expiry to the new attempt's and remembers that its order may be created", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);
      const other = pendingTransaction(registerId);
      const expiresAt = new Date("2026-10-09T12:08:10.000Z");

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordPendingTransaction(other);
        await lane.recordCreationAttempt(transaction.id, expiresAt);
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded).toEqual({ ...transaction, expiresAt, creationOutcomeUnknown: true });
      expect(await storedRow(other.id)).toMatchObject({
        expiresAt: other.expiresAt,
        creationOutcomeUnknown: false,
      });
    });
  });

  describe("a creation attempt that created nothing", () => {
    it("forgets that the transaction's order may have been created", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { creationOutcomeUnknown: true });
      const other = pendingTransaction(registerId, { creationOutcomeUnknown: true });

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordPendingTransaction(other);
        await lane.recordCreationCreatedNothing(transaction.id);
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded).toEqual({ ...transaction, creationOutcomeUnknown: false });
      expect(await storedRow(other.id)).toMatchObject({ creationOutcomeUnknown: true });
    });
  });

  describe("a transaction left for review", () => {
    it("flags the transaction for a person to review, keeping its state", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);
      const other = pendingTransaction(registerId);

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordPendingTransaction(other);
        await lane.recordNeedsReview(transaction.id);
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded).toEqual({ ...transaction, needsReview: true });
      expect(await storedRow(other.id)).toMatchObject({ needsReview: false });
    });
  });

  describe("the expiry of a transaction", () => {
    it("ends the transaction as expired", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordExpired(transaction.id);
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded).toEqual({ ...transaction, state: "EXPIRED" });
    });
  });

  describe("the order of a transaction", () => {
    it("keeps the provider's order identifier alone when the creation answer is not recorded", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordOrderCreated(transaction.id, "ORD01", null);
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded).toEqual({ ...transaction, providerOrderId: "ORD01" });
      expect(await storedRow(transaction.id)).toMatchObject({ stateReadAt: null });
    });

    it("keeps the provider's order identifier with the state, the review flag and the read time the creation answered", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);

      await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordOrderCreated(transaction.id, "ORD01", {
          outcome: { state: "PENDING", needsReview: true },
          readAt: READ_AT,
        });
      });

      expect(await storedRow(transaction.id)).toMatchObject({
        providerOrderId: "ORD01",
        state: "PENDING",
        needsReview: true,
        stateReadAt: READ_AT,
      });
    });
  });

  describe("the result of an order", () => {
    it("moves the state, the review flag and the read time of the transaction", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);

      await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordOrderResult(
          transaction.id,
          { state: "PENDING", needsReview: true },
          READ_AT,
        );
      });

      expect(await storedRow(transaction.id)).toMatchObject({
        state: "PENDING",
        needsReview: true,
        stateReadAt: READ_AT,
      });
    });

    it("leaves the other transactions as they were", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);
      const other = pendingTransaction(registerId);

      await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordPendingTransaction(other);
        await lane.recordOrderResult(
          transaction.id,
          { state: "APPROVED", needsReview: false },
          READ_AT,
        );
      });

      expect(await storedRow(other.id)).toMatchObject({ state: "PENDING", stateReadAt: null });
    });
  });
});

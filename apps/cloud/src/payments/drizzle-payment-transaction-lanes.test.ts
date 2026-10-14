import { latePaymentRefund } from "@purosur/domain";
import { PaymentTransactionAlreadyRecorded } from "@purosur/domain/payments/use-cases";
import { eq } from "drizzle-orm";
import type { PgliteQueryResultHKT } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, paymentRefunds, paymentTransactions, registers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePaymentTransactionLanes } from "./drizzle-payment-transaction-lanes.js";
import {
  insertRegister,
  insertSyncedSaleHolding,
  pendingPointTransaction,
  pendingTransaction,
} from "./test-support/payment-transaction-fixtures.js";

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

    it("keeps a pending transaction on the integrated terminal with its method and provider", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingPointTransaction(registerId);

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded).toEqual(transaction);
      expect(recorded).toMatchObject({ method: "POINT", provider: "MERCADOPAGO_POINT" });
    });

    it("keeps a transaction marked as replaced", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { replaced: true });

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded?.replaced).toBe(true);
    });

    it("keeps a replaced transaction marked as replaced once the order it read comes back paid", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { replaced: true });

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordOrderResult(
          transaction.id,
          { state: "APPROVED", needsReview: false },
          READ_AT,
        );
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded).toMatchObject({ state: "APPROVED", replaced: true });
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

  describe("a payment cancelled before any order", () => {
    it("keeps it cancelled, with no order, with every field it was recorded with", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingPointTransaction(registerId, { state: "CANCELLED" });

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordCancelledWithoutOrder(transaction);
        return lane.recordedTransaction(registerId, transaction.id);
      });

      expect(recorded).toEqual(transaction);
    });

    it("refuses one another register already recorded with the error of the domain, leaving it as it was", async () => {
      const ownerId = await insertRegister(db, "caja-1");
      const otherRegisterId = await insertRegister(db, "caja-2");
      const transaction = pendingTransaction(ownerId);
      await lanes.inPaymentTransactionLane(transaction.id, (lane) =>
        lane.recordPendingTransaction(transaction),
      );

      await expect(
        lanes.inPaymentTransactionLane(transaction.id, (lane) =>
          lane.recordCancelledWithoutOrder({
            ...transaction,
            registerId: otherRegisterId,
            state: "CANCELLED",
          }),
        ),
      ).rejects.toBeInstanceOf(PaymentTransactionAlreadyRecorded);
      expect(await storedRow(transaction.id)).toMatchObject({
        registerId: ownerId,
        state: "PENDING",
      });
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

  describe("a creation that answered with the only order the transaction can have", () => {
    it("forgets that another order of the transaction may have been created", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { creationOutcomeUnknown: true });
      const other = pendingTransaction(registerId, { creationOutcomeUnknown: true });

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.recordPendingTransaction(other);
        await lane.recordNoOtherOrderPossible(transaction.id);
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

  describe("the state an order's record left the transaction in", () => {
    it("answers the state and replaced mark the result left, whichever side wrote them", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { replaced: true });

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        return lane.recordOrderResult(
          transaction.id,
          { state: "APPROVED", needsReview: false },
          READ_AT,
        );
      });

      expect(recorded).toEqual({ state: "APPROVED", replaced: true });
    });

    it("answers a replacement that landed after the lane last read the transaction", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await db
          .update(paymentTransactions)
          .set({ replaced: true })
          .where(eq(paymentTransactions.id, transaction.id));
        return lane.recordOrderResult(
          transaction.id,
          { state: "APPROVED", needsReview: false },
          READ_AT,
        );
      });

      expect(recorded).toEqual({ state: "APPROVED", replaced: true });
    });

    it("answers what the creation answer left when it carried a reading", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { replaced: true });

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        return lane.recordOrderCreated(transaction.id, "ORD01", {
          outcome: { state: "APPROVED", needsReview: false },
          readAt: READ_AT,
        });
      });

      expect(recorded).toEqual({ state: "APPROVED", replaced: true });
    });

    it("answers what the transaction already holds when the creation answer carried no reading", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { replaced: true });

      const recorded = await lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        return lane.recordOrderCreated(transaction.id, "ORD01", null);
      });

      expect(recorded).toEqual({ state: "PENDING", replaced: true });
    });

    it("refuses to answer for a transaction nobody recorded", async () => {
      const id = crypto.randomUUID();

      await expect(
        lanes.inPaymentTransactionLane(id, (lane) =>
          lane.recordOrderResult(id, { state: "APPROVED", needsReview: false }, READ_AT),
        ),
      ).rejects.toThrow(`payment transaction ${id} is not recorded`);
      await expect(
        lanes.inPaymentTransactionLane(id, (lane) => lane.recordOrderCreated(id, "ORD01", null)),
      ).rejects.toThrow(`payment transaction ${id} is not recorded`);
    });
  });

  describe("a paid order a sale the register synced holds", () => {
    async function recorded() {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { state: "APPROVED" });
      await db.insert(paymentTransactions).values(transaction);
      return transaction;
    }

    function heldBySale(paymentTransactionId: string) {
      return lanes.inPaymentTransactionLane(paymentTransactionId, (lane) =>
        lane.paidOrderHeldBySale(paymentTransactionId),
      );
    }

    it("is held when the synced sale holds its payment approved", async () => {
      const transaction = await recorded();
      await insertSyncedSaleHolding(db, transaction, "APPROVED");

      expect(await heldBySale(transaction.id)).toBe(true);
    });

    it("is not held when the synced sale holds its payment as not approved", async () => {
      const transaction = await recorded();
      await insertSyncedSaleHolding(db, transaction, "EXPIRED");

      expect(await heldBySale(transaction.id)).toBe(false);
    });

    it("is not held when no synced sale holds it", async () => {
      const transaction = await recorded();

      expect(await heldBySale(transaction.id)).toBe(false);
    });
  });

  describe("the refund task of a late payment", () => {
    async function lateTransaction() {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId, { state: "APPROVED", replaced: true });
      await lanes.inPaymentTransactionLane(transaction.id, (lane) =>
        lane.recordPendingTransaction(transaction),
      );
      const [register] = await db
        .select({ locationId: registers.locationId })
        .from(registers)
        .where(eq(registers.id, registerId));
      return { transaction, locationId: register?.locationId };
    }

    it("opens one pending refund task of the transaction's sale and amount, by its channel, at the moment it is told", async () => {
      const { transaction } = await lateTransaction();

      const opening = await lanes.inPaymentTransactionLane(transaction.id, (lane) =>
        lane.openLatePaymentRefund(latePaymentRefund(transaction), READ_AT),
      );

      expect(opening).toBe("opened");
      expect(await db.select().from(paymentRefunds)).toEqual([
        {
          id: expect.any(String),
          saleId: transaction.saleId,
          paymentId: null,
          paymentTransactionId: transaction.id,
          originEventId: null,
          providerOrderId: null,
          origin: "late_payment",
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: transaction.amount,
          state: "PENDING",
          occurredAt: READ_AT,
          doneBy: null,
          doneAt: null,
          discardedBy: null,
          discardedAt: null,
          confirmedBy: null,
          confirmedAt: null,
          sentAt: null,
          providerRefundId: null,
          attemptKey: null,
          lastRefusalReason: null,
        },
      ]);
    });

    it("opens, with the task, a warning for the register's branch scoped to the task", async () => {
      const { transaction, locationId } = await lateTransaction();

      await lanes.inPaymentTransactionLane(transaction.id, (lane) =>
        lane.openLatePaymentRefund(latePaymentRefund(transaction), READ_AT),
      );

      const [refund] = await db.select().from(paymentRefunds);
      expect(await db.select().from(alerts)).toEqual([
        expect.objectContaining({
          kind: "late_payment_refund",
          scope: refund?.id,
          level: "warning",
          audience: "local",
          locationId,
          detail: {
            saleId: transaction.saleId,
            amount: transaction.amount,
            providerOrderId: null,
          },
          openedAt: READ_AT,
        }),
      ]);
    });

    it("opens nothing more when the same payment is reported again", async () => {
      const { transaction } = await lateTransaction();
      const open = () =>
        lanes.inPaymentTransactionLane(transaction.id, (lane) =>
          lane.openLatePaymentRefund(latePaymentRefund(transaction), READ_AT),
        );
      await open();

      expect(await open()).toBe("already_open");

      expect(await db.select().from(paymentRefunds)).toHaveLength(1);
      expect(await db.select().from(alerts)).toHaveLength(1);
    });

    it("refuses to open a task for a payment nobody recorded, opening nothing", async () => {
      const unrecorded = pendingTransaction(crypto.randomUUID(), { state: "APPROVED" });

      await expect(
        lanes.inPaymentTransactionLane(unrecorded.id, (lane) =>
          lane.openLatePaymentRefund(latePaymentRefund(unrecorded), READ_AT),
        ),
      ).rejects.toThrow(`payment transaction ${unrecorded.id} is not recorded`);

      expect(await db.select().from(paymentRefunds)).toEqual([]);
      expect(await db.select().from(alerts)).toEqual([]);
    });

    it("leaves neither the task nor the alert behind when the work it was part of fails", async () => {
      const { transaction } = await lateTransaction();

      const failure = lanes.inPaymentTransactionLane(transaction.id, (lane) =>
        lane.inOneTransaction(async (atomic) => {
          await atomic.openLatePaymentRefund(latePaymentRefund(transaction), READ_AT);
          throw new Error("the work broke");
        }),
      );

      await expect(failure).rejects.toThrow("the work broke");
      expect(await db.select().from(paymentRefunds)).toEqual([]);
      expect(await db.select().from(alerts)).toEqual([]);
    });

    it("leaves the recorded result behind too when the work fails after it", async () => {
      const registerId = await insertRegister(db, "caja-1");
      const transaction = pendingTransaction(registerId);

      const failure = lanes.inPaymentTransactionLane(transaction.id, async (lane) => {
        await lane.recordPendingTransaction(transaction);
        await lane.inOneTransaction(async (atomic) => {
          await atomic.recordOrderResult(
            transaction.id,
            { state: "APPROVED", needsReview: false },
            READ_AT,
          );
          throw new Error("the work broke");
        });
      });

      await expect(failure).rejects.toThrow("the work broke");
      expect(await storedRow(transaction.id)).toMatchObject({ state: "PENDING" });
    });
  });
});

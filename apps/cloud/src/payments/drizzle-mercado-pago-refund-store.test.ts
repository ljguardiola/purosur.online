import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, paymentRefunds } from "../platform/db/schema.js";
import { insertLocation, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleMercadoPagoRefundStore } from "./drizzle-mercado-pago-refund-store.js";
import { ORDER_ID } from "./test-support/fake-mercado-pago-orders.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";
import { aPendingQrRefundOfCancelledSale } from "./test-support/qr-refund-fixtures.js";

const NOW = new Date("2026-10-13T15:00:00.000Z");
const LATER = new Date("2026-10-13T15:30:00.000Z");

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

const store = () => new DrizzleMercadoPagoRefundStore(db);

async function storedRefund(refundId: string) {
  const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
  return refund;
}

describe("DrizzleMercadoPagoRefundStore", () => {
  describe("refundReference", () => {
    it("gives the method, origin and payment transaction of a refund of the branch", async () => {
      const { refundId, locationId, transactionId } = await aPendingQrRefundOfCancelledSale(db, {
        cancelledAt: NOW,
      });

      expect(await store().refundReference(refundId, locationId)).toEqual({
        refundId,
        locationId,
        method: "QR",
        origin: "sale_cancelled",
        paymentTransactionId: transactionId,
        confirmedAt: null,
        lastRefusalReason: null,
      });
    });

    it("finds no refund of another branch, nor one that does not exist", async () => {
      const { refundId, locationId } = await aPendingQrRefundOfCancelledSale(db, {
        cancelledAt: NOW,
      });
      const otherLocationId = await insertLocation(db);

      expect(await store().refundReference(refundId, otherLocationId)).toBeUndefined();
      expect(
        await store().refundReference("00000000-0000-4000-8000-000000000000", locationId),
      ).toBeUndefined();
    });

    it("gives the origin of a late-payment refund, so it is not taken for one the cloud sends", async () => {
      const { refundId, locationId } = await aPendingLatePaymentRefund(db, { openedAt: NOW });

      expect(await store().refundReference(refundId, locationId)).toMatchObject({
        origin: "late_payment",
      });
    });
  });

  describe("confirmedPendingRefunds", () => {
    it("lists only the pending refunds a person confirmed, whatever their branch", async () => {
      const confirmed = await aPendingQrRefundOfCancelledSale(db, {
        cancelledAt: NOW,
        orderId: "ORD-A",
      });
      const unconfirmed = await aPendingQrRefundOfCancelledSale(db, {
        cancelledAt: NOW,
        orderId: "ORD-B",
        registerName: "Caja 2",
      });
      const done = await aPendingQrRefundOfCancelledSale(db, {
        cancelledAt: NOW,
        orderId: "ORD-C",
        registerName: "Caja 3",
      });
      await db
        .update(paymentRefunds)
        .set({ confirmedBy: "manager", confirmedAt: NOW })
        .where(eq(paymentRefunds.id, confirmed.refundId));
      await db
        .update(paymentRefunds)
        .set({
          confirmedBy: "manager",
          confirmedAt: NOW,
          state: "APPROVED",
          doneBy: "manager",
          doneAt: NOW,
        })
        .where(eq(paymentRefunds.id, done.refundId));

      const listed = await store().confirmedPendingRefunds();

      expect(listed.map((refund) => refund.refundId)).toEqual([confirmed.refundId]);
      expect(listed.map((refund) => refund.refundId)).not.toContain(unconfirmed.refundId);
      expect(listed[0]).toMatchObject({
        locationId: confirmed.locationId,
        paymentTransactionId: confirmed.transactionId,
        confirmedAt: NOW,
        lastRefusalReason: null,
      });
    });
  });

  describe("lockMercadoPagoRefund", () => {
    it("gives the refund with its payment, the Mercado Pago order and the event it came from", async () => {
      const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });

      const locked = await store().transaction((tx) =>
        tx.lockMercadoPagoRefund(pending.refundId, pending.locationId),
      );

      expect(locked).toEqual({
        id: pending.refundId,
        locationId: pending.locationId,
        saleId: pending.saleId,
        state: "PENDING",
        origin: "sale_cancelled",
        method: "QR",
        amount: 2_450,
        ownOrderId: null,
        salePaymentAmount: 2_450,
        refundedOfSalePayment: 0,
        paymentTransaction: { orderId: ORDER_ID, amount: 2_450, state: "APPROVED" },
        refundedOfPaymentTransactionByOrder: [],
        paymentTransactionId: pending.transactionId,
        originEventId: pending.originEventId,
        confirmedBy: null,
        confirmedAt: null,
        sentAt: null,
        providerRefundId: null,
        attemptKey: null,
        lastRefusalReason: null,
      });
    });

    it("counts what other pending or done refunds of the same payment already hold, never its own nor a discarded one", async () => {
      const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
      const [own] = await db
        .select()
        .from(paymentRefunds)
        .where(eq(paymentRefunds.id, pending.refundId));
      if (!own?.paymentId) {
        throw new Error("test setup: the refund has no payment");
      }
      const another = (state: string, amount: number) =>
        db.insert(paymentRefunds).values({
          id: crypto.randomUUID(),
          saleId: own.saleId,
          paymentId: own.paymentId,
          paymentTransactionId: null,
          originEventId: crypto.randomUUID(),
          origin: "sale_cancelled",
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount,
          state,
          occurredAt: NOW,
          ...(state === "APPROVED" ? { doneBy: "manager", doneAt: NOW } : {}),
          ...(state === "DISCARDED" ? { discardedBy: "manager", discardedAt: NOW } : {}),
        });
      await another("PENDING", 100);
      await another("APPROVED", 200);
      await another("DISCARDED", 400);

      const locked = await store().transaction((tx) =>
        tx.lockMercadoPagoRefund(pending.refundId, pending.locationId),
      );

      expect(locked?.refundedOfSalePayment).toBe(300);
    });

    it("has no order for a payment whose transaction never got one", async () => {
      const pending = await aPendingQrRefundOfCancelledSale(db, {
        cancelledAt: NOW,
        orderId: null,
      });

      const locked = await store().transaction((tx) =>
        tx.lockMercadoPagoRefund(pending.refundId, pending.locationId),
      );

      expect(locked?.paymentTransaction?.orderId).toBeNull();
    });

    it("has no payment transaction for a refund that names none", async () => {
      const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
      await db
        .update(paymentRefunds)
        .set({ paymentTransactionId: null })
        .where(eq(paymentRefunds.id, pending.refundId));

      const locked = await store().transaction((tx) =>
        tx.lockMercadoPagoRefund(pending.refundId, pending.locationId),
      );

      expect(locked).toMatchObject({
        paymentTransaction: null,
        refundedOfPaymentTransactionByOrder: [],
      });
    });

    it("finds no refund of another branch", async () => {
      const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
      const otherLocationId = await insertLocation(db);

      const locked = await store().transaction((tx) =>
        tx.lockMercadoPagoRefund(pending.refundId, otherLocationId),
      );

      expect(locked).toBeUndefined();
    });
  });

  describe("a late QR payment refund", () => {
    it("is listed among the confirmed pending refunds, with its branch and payment transaction", async () => {
      const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });
      await db
        .update(paymentRefunds)
        .set({ confirmedBy: "manager", confirmedAt: NOW })
        .where(eq(paymentRefunds.id, late.refundId));

      expect(await store().confirmedPendingRefunds()).toEqual([
        {
          refundId: late.refundId,
          locationId: late.locationId,
          method: "QR",
          origin: "late_payment",
          paymentTransactionId: late.transactionId,
          confirmedAt: NOW,
          lastRefusalReason: null,
        },
      ]);
    });

    it("is locked with the order, the amount and the state of the payment that arrived late, and nothing refunded of it yet", async () => {
      const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });

      const locked = await store().transaction((tx) =>
        tx.lockMercadoPagoRefund(late.refundId, late.locationId),
      );

      expect(locked).toEqual({
        id: late.refundId,
        locationId: late.locationId,
        saleId: late.saleId,
        state: "PENDING",
        origin: "late_payment",
        method: "QR",
        amount: late.amount,
        ownOrderId: null,
        salePaymentAmount: null,
        refundedOfSalePayment: 0,
        paymentTransaction: { orderId: ORDER_ID, amount: late.amount, state: "APPROVED" },
        refundedOfPaymentTransactionByOrder: [],
        paymentTransactionId: late.transactionId,
        originEventId: null,
        confirmedBy: null,
        confirmedAt: null,
        sentAt: null,
        providerRefundId: null,
        attemptKey: null,
        lastRefusalReason: null,
      });
    });

    it("is locked with the other order and the paid amount recorded on it, beside its payment transaction, when the payment arrived on an order the cloud did not create", async () => {
      const late = await aPendingLatePaymentRefund(db, {
        openedAt: NOW,
        orderId: ORDER_ID,
        providerOrderId: "ORD-OTHER",
        amount: 5_000,
        refundAmount: 1_800,
      });

      const locked = await store().transaction((tx) =>
        tx.lockMercadoPagoRefund(late.refundId, late.locationId),
      );

      expect(locked).toMatchObject({
        ownOrderId: "ORD-OTHER",
        amount: 1_800,
        paymentTransaction: { orderId: ORDER_ID, amount: 5_000, state: "APPROVED" },
      });
    });

    it("gives the state the cloud holds the payment transaction in, whatever it is", async () => {
      const late = await aPendingLatePaymentRefund(db, {
        openedAt: NOW,
        orderId: ORDER_ID,
        transactionState: "EXPIRED",
      });

      const locked = await store().transaction((tx) =>
        tx.lockMercadoPagoRefund(late.refundId, late.locationId),
      );

      expect(locked?.paymentTransaction?.state).toBe("EXPIRED");
    });

    it("gives what the other pending or done refunds of its payment transaction hold, by the order each refunds, never its own nor a discarded one", async () => {
      const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });
      const [own] = await db
        .select()
        .from(paymentRefunds)
        .where(eq(paymentRefunds.id, late.refundId));
      if (!own) {
        throw new Error("test setup: the refund is not stored");
      }
      const another = (providerOrderId: string | null, state: string, amount: number) =>
        db.insert(paymentRefunds).values({
          ...own,
          id: crypto.randomUUID(),
          providerOrderId,
          state,
          amount,
          ...(state === "APPROVED" ? { doneBy: "manager", doneAt: NOW } : {}),
          ...(state === "DISCARDED" ? { discardedBy: "manager", discardedAt: NOW } : {}),
        });
      await another("ORD-A", "PENDING", 700);
      await another("ORD-B", "APPROVED", 50);
      await another("ORD-C", "DISCARDED", 400);

      const locked = await store().transaction((tx) =>
        tx.lockMercadoPagoRefund(late.refundId, late.locationId),
      );

      expect(locked?.refundedOfPaymentTransactionByOrder).toEqual([
        { orderId: "ORD-A", amount: 700 },
        { orderId: "ORD-B", amount: 50 },
      ]);
    });

    it("finds no late refund of another branch", async () => {
      const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });
      const otherLocationId = await insertLocation(db);

      expect(
        await store().transaction((tx) => tx.lockMercadoPagoRefund(late.refundId, otherLocationId)),
      ).toBeUndefined();
    });
  });

  describe("cancellationOfEvent", () => {
    it("gives the sale an applied cancelling event cancelled", async () => {
      const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });

      expect(
        await store().transaction((tx) => tx.cancellationOfEvent(pending.originEventId)),
      ).toEqual({ saleId: pending.saleId });
    });

    it("gives nothing for an event the cloud does not hold", async () => {
      await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });

      expect(
        await store().transaction((tx) => tx.cancellationOfEvent(crypto.randomUUID())),
      ).toBeNull();
    });

    it("gives nothing for an event that is not a cancellation", async () => {
      const pending = await aPendingQrRefundOfCancelledSale(db, {
        cancelledAt: NOW,
        cancellingEvent: false,
      });
      await insertInboxEvent(db, pending.deviceId, {
        eventId: pending.originEventId,
        aggregateId: pending.saleId,
        eventType: "sale_completed",
        appliedAt: NOW,
      });

      expect(
        await store().transaction((tx) => tx.cancellationOfEvent(pending.originEventId)),
      ).toBeNull();
    });

    it("gives nothing for a cancelling event the cloud has not applied", async () => {
      const pending = await aPendingQrRefundOfCancelledSale(db, {
        cancelledAt: NOW,
        cancellingEvent: false,
      });
      await insertInboxEvent(db, pending.deviceId, {
        eventId: pending.originEventId,
        aggregateId: pending.saleId,
        eventType: "sale_cancelled",
        schemaVersion: 6,
      });

      expect(
        await store().transaction((tx) => tx.cancellationOfEvent(pending.originEventId)),
      ).toBeNull();
    });
  });

  describe("recording the progress", () => {
    async function lockedPending() {
      const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
      const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
      return { ...pending, userId };
    }

    it("records who confirmed the refund, when, and the key of its first attempt, leaving an audit entry", async () => {
      const { refundId, userId } = await lockedPending();

      await store().transaction((tx) => tx.recordRefundConfirmed(refundId, userId, NOW, "key-1"));

      expect(await storedRefund(refundId)).toMatchObject({
        state: "PENDING",
        confirmedBy: userId,
        confirmedAt: NOW,
        attemptKey: "key-1",
      });
      const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, refundId));
      expect(audit).toMatchObject({
        entity: "payment_refund",
        actorId: userId,
        at: NOW,
        previousValue: { confirmed: false },
        newValue: { confirmed: true, confirmedAt: NOW.toISOString() },
      });
    });

    it("replaces and clears the attempt key of a confirmed refund", async () => {
      const { refundId, userId } = await lockedPending();
      await store().transaction((tx) => tx.recordRefundConfirmed(refundId, userId, NOW, "key-1"));

      await store().transaction((tx) => tx.recordAttemptKey(refundId, null));
      expect((await storedRefund(refundId))?.attemptKey).toBeNull();

      await store().transaction((tx) => tx.recordAttemptKey(refundId, "key-2"));
      expect((await storedRefund(refundId))?.attemptKey).toBe("key-2");
    });

    it("records the refund Mercado Pago accepted and forgets the reason an earlier attempt was refused", async () => {
      const { refundId, userId } = await lockedPending();
      await store().transaction(async (tx) => {
        await tx.recordRefundConfirmed(refundId, userId, NOW, "key-1");
        await tx.recordRefundRefusal(refundId, "insufficient_balance", NOW);
      });

      await store().transaction((tx) => tx.recordRefundSent(refundId, "REF-1", LATER));

      expect(await storedRefund(refundId)).toMatchObject({
        sentAt: LATER,
        providerRefundId: "REF-1",
        lastRefusalReason: null,
        state: "PENDING",
      });
    });

    it("records why Mercado Pago did not refund, leaving an audit entry at the moment it was refused", async () => {
      const { refundId, userId } = await lockedPending();
      await store().transaction((tx) => tx.recordRefundConfirmed(refundId, userId, NOW, "key-1"));

      await store().transaction((tx) =>
        tx.recordRefundRefusal(refundId, "refund_period_exceeded", LATER),
      );

      expect((await storedRefund(refundId))?.lastRefusalReason).toBe("refund_period_exceeded");
      const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, refundId));
      expect(audits.map(({ actorId, at, newValue }) => ({ actorId, at, newValue }))).toContainEqual(
        {
          actorId: userId,
          at: LATER,
          newValue: { lastRefusalReason: "refund_period_exceeded" },
        },
      );
    });

    it("marks the refund done after locking it, logging the completion for its branch", async () => {
      const { refundId, locationId, userId } = await lockedPending();
      await store().transaction((tx) => tx.recordRefundConfirmed(refundId, userId, NOW, "key-1"));
      const since = await lastLoggedChangeSeq(db);

      await store().transaction(async (tx) => {
        await tx.lockMercadoPagoRefund(refundId, locationId);
        await tx.recordRefundDone(refundId, userId, LATER);
      });

      expect(await storedRefund(refundId)).toMatchObject({
        state: "APPROVED",
        doneBy: userId,
        doneAt: LATER,
      });
      expect(await changesLoggedAfter(db, since)).toEqual([
        { entity: "refund_completion", entityId: refundId, version: 1, op: "insert", locationId },
      ]);
    });

    it("leaves the refund as it was when the transaction fails", async () => {
      const { refundId, userId } = await lockedPending();

      await store()
        .transaction(async (tx) => {
          await tx.recordRefundConfirmed(refundId, userId, NOW, "key-1");
          throw new Error("rolled back");
        })
        .catch(() => undefined);

      expect(await storedRefund(refundId)).toMatchObject({ confirmedBy: null, attemptKey: null });
      expect(await db.select().from(auditLog).where(eq(auditLog.entityId, refundId))).toEqual([]);
    });
  });
});

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentRefunds, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCancelledSale, applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { insertLocation, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { aTransferCancelledSale } from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePendingRefundsReader } from "./drizzle-pending-refunds-reader.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";
import { aPendingQrRefundOfCancelledSale } from "./test-support/mercado-pago-refund-fixtures.js";
import { aPendingRefundOfVoidedSale } from "./test-support/voided-sale-refund-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");

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

const reader = () => new DrizzlePendingRefundsReader(db);

describe("DrizzlePendingRefundsReader.pendingRefunds", () => {
  it("lists the pending refund of a cancelled sale with its register and who cancelled it", async () => {
    const { deviceId, locationId, registerId } = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 1",
    });
    const { userId } = await signedInWith(db, [], NOW);
    const cancelled = aTransferCancelledSale({ actorId: userId });
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: new Date("2026-10-07T14:00:00.000Z"),
      total: 2_000,
      overrides: cancelled,
    });
    const [refund] = cancelled.refunds;

    const pending = await reader().pendingRefunds(locationId);

    expect(pending).toEqual([
      {
        id: refund?.id,
        saleId: cancelled.id,
        registerId,
        registerName: "Caja 1",
        method: "TRANSFER",
        origin: "sale_cancelled",
        amount: 2_000,
        occurredAt: refund?.occurredAt,
        saleOccurredAt: cancelled.cancelledAt,
        coveredBy: [],
        providerOrderId: null,
        cancelledBy: userId,
        cancelledByName: "Ada Lucero",
        confirmedAt: null,
        sentAt: null,
        lastRefusalReason: null,
      },
    ]);
  });

  it("lists the pending refund of a voided sale dated when the sale was voided, with its register and who rang it up", async () => {
    const voidedAt = new Date("2026-10-07T14:00:00.000Z");
    const refund = await aPendingRefundOfVoidedSale(db, { voidedAt, registerName: "Caja 3" });

    const pending = await reader().pendingRefunds(refund.locationId);

    expect(pending).toEqual([
      expect.objectContaining({
        id: refund.refundId,
        saleId: refund.saleId,
        registerName: "Caja 3",
        method: "TRANSFER",
        origin: "sale_voided",
        amount: 2_000,
        occurredAt: voidedAt,
        saleOccurredAt: voidedAt,
        coveredBy: [],
      }),
    ]);
  });

  it("names nobody when the sale was cancelled by someone the cloud does not know", async () => {
    const { deviceId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: NOW,
      total: 2_000,
      overrides: aTransferCancelledSale({ actorId: "not-a-known-user" }),
    });

    const [refund] = await reader().pendingRefunds(locationId);

    expect(refund).toMatchObject({ cancelledBy: "not-a-known-user", cancelledByName: null });
  });

  it("lists the oldest refund first", async () => {
    const { deviceId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    const apply = (cancelledAt: string) =>
      applyCancelledSale(db, {
        deviceId,
        cancelledAt: new Date(cancelledAt),
        total: 2_000,
        overrides: aTransferCancelledSale({ cancelledAt: new Date(cancelledAt) }),
      });
    const later = await apply("2026-10-07T14:00:00.000Z");
    const earlier = await apply("2026-10-06T14:00:00.000Z");

    const pending = await reader().pendingRefunds(locationId);

    expect(pending.map((refund) => refund.saleId)).toEqual([earlier.id, later.id]);
  });

  it("leaves out the refunds a person already marked as done and the ones nobody has to carry out", async () => {
    const { deviceId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
    await applyCancelledSale(db, { deviceId, cancelledAt: NOW, total: 1_000 });
    await applyCompletedSale(db, { deviceId, completedAt: NOW, total: 1_000 });

    expect(await reader().pendingRefunds(locationId)).toEqual([]);
  });

  it("never lists the pending refunds of another branch", async () => {
    const own = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
    const otherLocationId = await insertLocation(db);
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: otherLocationId, name: "Caja 1" })
      .returning({ id: registers.id });
    const other = await insertEnrolledInstallation(db, {
      now: NOW,
      existingRegisterId: otherRegister?.id ?? randomUUID(),
    });
    await applyCancelledSale(db, {
      deviceId: other.deviceId,
      cancelledAt: NOW,
      total: 2_000,
      overrides: aTransferCancelledSale(),
    });

    expect(await reader().pendingRefunds(own.locationId)).toEqual([]);
    expect(await reader().pendingRefunds(otherLocationId)).toHaveLength(1);
  });

  describe("the refund of a QR payment of a cancelled sale", () => {
    it("lists how far the cloud got with it: when it was confirmed and sent and why Mercado Pago did not refund it", async () => {
      const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
      const { userId } = await signedInWith(db, [], NOW);
      const sentAt = new Date("2026-10-07T15:10:00.000Z");
      await db
        .update(paymentRefunds)
        .set({
          confirmedBy: userId,
          confirmedAt: NOW,
          sentAt,
          providerRefundId: "REF-1",
          lastRefusalReason: "insufficient_balance",
        })
        .where(eq(paymentRefunds.id, pending.refundId));

      const [refund] = await reader().pendingRefunds(pending.locationId);

      expect(refund).toMatchObject({
        id: pending.refundId,
        method: "QR",
        origin: "sale_cancelled",
        confirmedAt: NOW,
        sentAt,
        lastRefusalReason: "insufficient_balance",
      });
    });
  });

  describe("the refund of a late payment", () => {
    it("lists it with the channel it was paid by, its sale and register, and nobody who cancelled it", async () => {
      const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, registerName: "Caja 7" });

      expect(await reader().pendingRefunds(late.locationId)).toEqual([
        {
          id: late.refundId,
          saleId: late.saleId,
          registerId: late.registerId,
          registerName: "Caja 7",
          method: "QR",
          origin: "late_payment",
          amount: late.amount,
          occurredAt: NOW,
          saleOccurredAt: late.saleOccurredAt,
          coveredBy: [],
          providerOrderId: null,
          cancelledBy: null,
          cancelledByName: null,
          confirmedAt: null,
          sentAt: null,
          lastRefusalReason: null,
        },
      ]);
    });

    it("lists the Mercado Pago order it is the refund of, when it names one", async () => {
      const late = await aPendingLatePaymentRefund(db, {
        openedAt: NOW,
        providerOrderId: "ORD01SECOND",
      });

      const [refund] = await reader().pendingRefunds(late.locationId);

      expect(refund?.providerOrderId).toBe("ORD01SECOND");
    });

    it("lists the methods that covered its sale once the sale reached the cloud, each once", async () => {
      const late = await aPendingLatePaymentRefund(db, {
        openedAt: NOW,
        coveredBy: ["TRANSFER", "CASH", "TRANSFER"],
      });

      const [refund] = await reader().pendingRefunds(late.locationId);

      expect(refund?.coveredBy).toEqual(["CASH", "TRANSFER"]);
    });

    it("lists no covering method while its sale has not reached the cloud", async () => {
      const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });

      const [refund] = await reader().pendingRefunds(late.locationId);

      expect(refund?.coveredBy).toEqual([]);
    });

    it("lists it in the same order as the refunds of cancelled sales, oldest first", async () => {
      const { deviceId } = await insertEnrolledInstallation(db, {
        now: NOW,
        registerName: "Caja 1",
      });
      const cancelled = await applyCancelledSale(db, {
        deviceId,
        cancelledAt: new Date("2026-10-07T14:00:00.000Z"),
        total: 2_000,
        overrides: aTransferCancelledSale({ cancelledAt: new Date("2026-10-07T14:00:00.000Z") }),
      });
      const late = await aPendingLatePaymentRefund(db, {
        openedAt: new Date("2026-10-07T13:00:00.000Z"),
        registerName: "Caja 2",
      });

      const pending = await reader().pendingRefunds(late.locationId);

      expect(pending.map((refund) => [refund.saleId, refund.origin])).toEqual([
        [late.saleId, "late_payment"],
        [cancelled.id, "sale_cancelled"],
      ]);
    });

    it("leaves it out once it was marked as done or discarded", async () => {
      const done = await aPendingLatePaymentRefund(db, { openedAt: NOW, registerName: "Caja 1" });
      const discarded = await aPendingLatePaymentRefund(db, {
        openedAt: NOW,
        registerName: "Caja 2",
      });
      await db
        .update(paymentRefunds)
        .set({ state: "APPROVED", doneBy: "user-1", doneAt: NOW })
        .where(eq(paymentRefunds.id, done.refundId));
      await db
        .update(paymentRefunds)
        .set({ state: "DISCARDED", discardedBy: "user-1", discardedAt: NOW })
        .where(eq(paymentRefunds.id, discarded.refundId));

      expect(await reader().pendingRefunds(done.locationId)).toEqual([]);
    });

    it("never lists it for another branch", async () => {
      const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });
      const otherLocationId = await insertLocation(db);
      await db
        .update(registers)
        .set({ locationId: otherLocationId })
        .where(eq(registers.id, late.registerId));

      expect(await reader().pendingRefunds(late.locationId)).toEqual([]);
      expect(await reader().pendingRefunds(otherLocationId)).toHaveLength(1);
    });
  });
});

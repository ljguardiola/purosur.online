import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { paymentRefunds, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCancelledSale, applyCompletedSale } from "../sales/test-support/applied-sales.js";
import { insertLocation, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { aTransferCancelledSale } from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePendingRefundsReader } from "./drizzle-pending-refunds-reader.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";

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
        cancelledBy: userId,
        cancelledByName: "Ada Lucero",
      },
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
          cancelledBy: null,
          cancelledByName: null,
        },
      ]);
    });

    it("lists it in the same order as the refunds of cancelled sales, oldest first", async () => {
      const { deviceId } = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 1" });
      const cancelled = await applyCancelledSale(db, {
        deviceId,
        cancelledAt: new Date("2026-10-07T14:00:00.000Z"),
        total: 2_000,
        overrides: aTransferCancelledSale(),
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
      const discarded = await aPendingLatePaymentRefund(db, { openedAt: NOW, registerName: "Caja 2" });
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

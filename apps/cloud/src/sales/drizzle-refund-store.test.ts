import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLog, paymentRefunds } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { aTransferCancelledSale } from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRefundStore } from "./drizzle-refund-store.js";
import { applyCancelledSale } from "./test-support/applied-sales.js";

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

async function aPendingRefund() {
  const { deviceId, locationId } = await insertEnrolledInstallation(db, { now: NOW });
  const cancelled = await applyCancelledSale(db, {
    deviceId,
    cancelledAt: NOW,
    total: 2_000,
    overrides: aTransferCancelledSale(),
  });
  const [refund] = cancelled.refunds;
  if (!refund) {
    throw new Error("test setup: the cancelled sale has no refund");
  }
  return { refundId: refund.id, locationId };
}

const store = () => new DrizzleRefundStore(db);

describe("DrizzleRefundStore", () => {
  it("locks a refund of the branch and tells its state", async () => {
    const { refundId, locationId } = await aPendingRefund();

    const locked = await store().transaction((tx) => tx.lockRefund(refundId, locationId));

    expect(locked).toEqual({ id: refundId, state: "PENDING" });
  });

  it("finds no refund that belongs to another branch, nor one that does not exist", async () => {
    const { refundId, locationId } = await aPendingRefund();
    const otherLocationId = await insertLocation(db);

    const ofAnotherBranch = await store().transaction((tx) =>
      tx.lockRefund(refundId, otherLocationId),
    );
    const unknown = await store().transaction((tx) =>
      tx.lockRefund("00000000-0000-4000-8000-000000000000", locationId),
    );

    expect(ofAnotherBranch).toBeUndefined();
    expect(unknown).toBeUndefined();
  });

  it("records who marked the refund as done and when, and leaves an audit entry", async () => {
    const { refundId, locationId } = await aPendingRefund();
    const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const doneAt = new Date("2026-10-08T09:00:00.000Z");

    await store().transaction(async (tx) => {
      await tx.lockRefund(refundId, locationId);
      await tx.recordRefundDone(refundId, userId, doneAt);
    });

    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
    expect(refund).toMatchObject({ state: "APPROVED", doneBy: userId, doneAt });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, refundId));
    expect(audit).toMatchObject({
      entity: "payment_refund",
      actorId: userId,
      at: doneAt,
      previousValue: { state: "PENDING" },
      newValue: { state: "APPROVED", doneAt: doneAt.toISOString() },
    });
  });
});

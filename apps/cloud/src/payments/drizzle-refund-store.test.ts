import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, auditLog, paymentRefunds, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCancelledSale } from "../sales/test-support/applied-sales.js";
import { insertLocation, signedInWith } from "../stock/test-support/stock-route-fixtures.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { aTransferCancelledSale } from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRefundStore } from "./drizzle-refund-store.js";
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

    expect(locked).toEqual({
      id: refundId,
      state: "PENDING",
      origin: "sale_cancelled",
      method: "TRANSFER",
    });
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

  it("logs the completion for the branch of the refund, once the refund is marked done", async () => {
    const { refundId, locationId } = await aPendingRefund();
    const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const since = await lastLoggedChangeSeq(db);

    await store().transaction(async (tx) => {
      await tx.lockRefund(refundId, locationId);
      await tx.recordRefundDone(refundId, userId, NOW);
    });

    expect(await changesLoggedAfter(db, since)).toEqual([
      { entity: "refund_completion", entityId: refundId, version: 1, op: "insert", locationId },
    ]);
  });

  it("logs no completion when the marking is rolled back", async () => {
    const { refundId, locationId } = await aPendingRefund();
    const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const since = await lastLoggedChangeSeq(db);

    await store()
      .transaction(async (tx) => {
        await tx.lockRefund(refundId, locationId);
        await tx.recordRefundDone(refundId, userId, NOW);
        throw new Error("rolled back");
      })
      .catch(() => undefined);

    expect(await changesLoggedAfter(db, since)).toEqual([]);
  });

  it.each([
    ["never locked", async () => undefined],
    [
      "locked only in an earlier transaction",
      (refundId: string, locationId: string) =>
        store().transaction((tx) => tx.lockRefund(refundId, locationId)),
    ],
  ])("refuses to mark done a refund %s, changing nothing", async (_, lockBefore) => {
    const { refundId, locationId } = await aPendingRefund();
    const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    await lockBefore(refundId, locationId);
    const since = await lastLoggedChangeSeq(db);

    await expect(
      store().transaction((tx) => tx.recordRefundDone(refundId, userId, NOW)),
    ).rejects.toThrow("a refund is marked done only after it is locked");

    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
    expect(refund).toMatchObject({ state: "PENDING", doneBy: null, doneAt: null });
    expect(await changesLoggedAfter(db, since)).toEqual([]);
  });

  it("logs no completion when a refund is discarded", async () => {
    const { refundId, locationId } = await aPendingLatePaymentRefund(db, { openedAt: NOW });
    const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const since = await lastLoggedChangeSeq(db);

    await store().transaction(async (tx) => {
      await tx.lockRefund(refundId, locationId);
      await tx.recordRefundDiscarded(refundId, userId, NOW);
    });

    expect(await changesLoggedAfter(db, since)).toEqual([]);
  });

  describe("the refund of a late payment", () => {
    it("logs its completion for the branch of its register", async () => {
      const { refundId, locationId } = await aPendingLatePaymentRefund(db, { openedAt: NOW });
      const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
      const since = await lastLoggedChangeSeq(db);

      await store().transaction(async (tx) => {
        await tx.lockRefund(refundId, locationId);
        await tx.recordRefundDone(refundId, userId, NOW);
      });

      expect(await changesLoggedAfter(db, since)).toEqual([
        { entity: "refund_completion", entityId: refundId, version: 1, op: "insert", locationId },
      ]);
    });

    it("locks it for the branch of its register and tells its origin", async () => {
      const { refundId, locationId } = await aPendingLatePaymentRefund(db, { openedAt: NOW });

      const locked = await store().transaction((tx) => tx.lockRefund(refundId, locationId));

      expect(locked).toEqual({
        id: refundId,
        state: "PENDING",
        origin: "late_payment",
        method: "QR",
      });
    });

    it("finds none that belongs to another branch", async () => {
      const { refundId, registerId } = await aPendingLatePaymentRefund(db, { openedAt: NOW });
      const otherLocationId = await insertLocation(db);
      await db
        .update(registers)
        .set({ locationId: otherLocationId })
        .where(eq(registers.id, registerId));
      const firstLocationId = (await db.select().from(alerts))[0]?.locationId ?? "";

      const ofAnotherBranch = await store().transaction((tx) =>
        tx.lockRefund(refundId, firstLocationId),
      );

      expect(ofAnotherBranch).toBeUndefined();
    });

    it("records who discarded it and when, and leaves an audit entry", async () => {
      const { refundId, locationId } = await aPendingLatePaymentRefund(db, { openedAt: NOW });
      const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
      const discardedAt = new Date("2026-10-08T09:00:00.000Z");

      await store().transaction(async (tx) => {
        await tx.lockRefund(refundId, locationId);
        await tx.recordRefundDiscarded(refundId, userId, discardedAt);
      });

      const [refund] = await db
        .select()
        .from(paymentRefunds)
        .where(eq(paymentRefunds.id, refundId));
      expect(refund).toMatchObject({ state: "DISCARDED", discardedBy: userId, discardedAt });
      const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, refundId));
      expect(audit).toMatchObject({
        entity: "payment_refund",
        actorId: userId,
        at: discardedAt,
        previousValue: { state: "PENDING" },
        newValue: { state: "DISCARDED", discardedAt: discardedAt.toISOString() },
      });
    });

    it("resolves its open alert on behalf of the person who closed the task, leaving other tasks' alerts open", async () => {
      const task = await aPendingLatePaymentRefund(db, { openedAt: NOW, registerName: "Caja 1" });
      const other = await aPendingLatePaymentRefund(db, { openedAt: NOW, registerName: "Caja 2" });
      const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
      const resolvedAt = new Date("2026-10-08T09:00:00.000Z");

      await store().transaction((tx) =>
        tx.resolveRefundAlert(task.refundId, "late_payment_refund", userId, resolvedAt),
      );

      const rows = await db.select().from(alerts);
      expect(rows.find((alert) => alert.id === task.alertId)).toMatchObject({
        resolvedAt,
        resolvedBy: userId,
      });
      expect(rows.find((alert) => alert.id === other.alertId)).toMatchObject({ resolvedAt: null });
    });

    it("resolves the refund task alert of a cancelled sale's refund, and not an alert of another kind for the same refund", async () => {
      const { refundId, locationId } = await aPendingRefund();
      const [taskAlert, otherAlert] = await db
        .insert(alerts)
        .values(
          (["refund_task", "late_payment_refund"] as const).map((kind) => ({
            kind,
            scope: refundId,
            level: "warning" as const,
            audience: "local" as const,
            locationId,
            detail: {},
            openedAt: NOW,
          })),
        )
        .returning({ id: alerts.id });
      const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
      const resolvedAt = new Date("2026-10-08T09:00:00.000Z");

      await store().transaction((tx) =>
        tx.resolveRefundAlert(refundId, "refund_task", userId, resolvedAt),
      );

      const rows = await db.select().from(alerts);
      expect(rows.find((alert) => alert.id === taskAlert?.id)).toMatchObject({
        resolvedAt,
        resolvedBy: userId,
      });
      expect(rows.find((alert) => alert.id === otherAlert?.id)).toMatchObject({ resolvedAt: null });
    });

    it("resolves nothing, and fails nothing, when no alert is open for the task", async () => {
      const { refundId } = await aPendingLatePaymentRefund(db, { openedAt: NOW });
      const { userId } = await signedInWith(db, ["confirm_refunds"], NOW);
      const resolve = () =>
        store().transaction((tx) =>
          tx.resolveRefundAlert(
            refundId,
            "late_payment_refund",
            userId,
            new Date("2026-10-08T09:00:00.000Z"),
          ),
        );
      await resolve();

      await expect(resolve()).resolves.toBeUndefined();
    });
  });
});

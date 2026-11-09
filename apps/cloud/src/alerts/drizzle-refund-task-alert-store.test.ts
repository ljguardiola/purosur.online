import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aPendingRefundOfCancelledSale } from "../payments/test-support/cancelled-sale-refund-fixtures.js";
import { alerts } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRefundTaskAlertStore } from "./drizzle-refund-task-alert-store.js";

const CANCELLED_AT = new Date("2026-10-07T15:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

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

const store = () => new DrizzleRefundTaskAlertStore(db);

describe("DrizzleRefundTaskAlertStore", () => {
  it("opens the alert for the refund in the sale's branch, with the level it is given and escalating 72 hours after the refund opened", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });
    const openedAt = new Date(CANCELLED_AT.getTime() + 30 * HOUR_MS);

    await store().transaction(async (tx) => {
      const [locked] = await tx.lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert();
      if (!locked) {
        throw new Error("test setup: no refund was locked");
      }
      await tx.openRefundTaskAlert(locked, "critical", openedAt);
    });

    const [alert] = await db.select().from(alerts);
    expect(alert).toMatchObject({
      kind: "refund_task",
      scope: refund.refundId,
      level: "critical",
      audience: "local",
      locationId: refund.locationId,
      openedAt,
      escalateAt: new Date(CANCELLED_AT.getTime() + 72 * HOUR_MS),
      detail: {
        saleId: refund.saleId,
        amount: refund.amount,
        method: "TRANSFER",
        refundOpenedAt: CANCELLED_AT.toISOString(),
      },
    });
  });

  it("opens no second alert while one is already open for the refund", async () => {
    await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });
    const openIt = () =>
      store().transaction(async (tx) => {
        const [locked] = await tx.lockPendingRefundsOfCancelledSalesWithoutRefundTaskAlert();
        if (locked) {
          await tx.openRefundTaskAlert(locked, "warning", CANCELLED_AT);
        }
      });

    await openIt();
    await openIt();

    expect(await db.select().from(alerts)).toHaveLength(1);
  });
});

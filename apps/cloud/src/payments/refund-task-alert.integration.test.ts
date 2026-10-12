import { escalateOverdueAlerts } from "@purosur/domain/alerts/use-cases";
import {
  markRefundDone,
  openOverdueRefundTaskAlerts,
} from "@purosur/domain/payments/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DrizzleAlertStore } from "../alerts/drizzle-alert-store.js";
import { users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRefundStore } from "./drizzle-refund-store.js";
import { DrizzleRefundTaskAlertStore } from "./drizzle-refund-task-alert-store.js";
import { aPendingRefundOfCancelledSale } from "./test-support/cancelled-sale-refund-fixtures.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";

const CANCELLED_AT = new Date("2026-10-01T08:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("refund_task_alert");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function hoursAfterCancelling(hours: number): Date {
  return new Date(CANCELLED_AT.getTime() + hours * HOUR_MS);
}

function openOverdueAlerts(now: Date) {
  return openOverdueRefundTaskAlerts({
    store: new DrizzleRefundTaskAlertStore(db),
    clock: { now: () => now },
  });
}

async function alertsOf(refundId: string) {
  return sql<{ kind: string; level: string; location_id: string; escalate_at: Date; resolved_at: Date | null }[]>`
    select kind, level, location_id, escalate_at, resolved_at from alerts where scope = ${refundId}`;
}

async function aUserOf(locationId: string): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ada", email: `ada-${crypto.randomUUID()}@example.com`, locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: inserting the user returned no row");
  }
  return user.id;
}

describe("the alert of a refund left pending on a real Postgres", () => {
  it("opens a warning in the sale's branch once the refund has been pending for 24 hours", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });

    await openOverdueAlerts(hoursAfterCancelling(23));
    expect(await alertsOf(refund.refundId)).toEqual([]);
    await openOverdueAlerts(hoursAfterCancelling(24));

    expect(await alertsOf(refund.refundId)).toMatchObject([
      { kind: "refund_task", level: "warning", location_id: refund.locationId },
    ]);
  });

  it("opens no second alert when it is evaluated again", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });

    await openOverdueAlerts(hoursAfterCancelling(24));
    await openOverdueAlerts(hoursAfterCancelling(25));

    expect(await alertsOf(refund.refundId)).toHaveLength(1);
  });

  it("opens nothing for the refund of a payment that arrived late, which has its own alert", async () => {
    const late = await aPendingLatePaymentRefund(db, { openedAt: CANCELLED_AT });

    await openOverdueAlerts(hoursAfterCancelling(100));

    expect(await alertsOf(late.refundId)).toMatchObject([{ kind: "late_payment_refund" }]);
  });

  it("escalates to critical 72 hours after the refund opened, whenever the alert opened", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });
    await openOverdueAlerts(hoursAfterCancelling(30));
    const escalate = (now: Date) =>
      escalateOverdueAlerts({
        store: new DrizzleAlertStore(db, () => now),
        clock: { now: () => now },
      });

    await escalate(hoursAfterCancelling(71));
    expect(await alertsOf(refund.refundId)).toMatchObject([{ level: "warning" }]);
    await escalate(hoursAfterCancelling(72));

    const [alert] = await alertsOf(refund.refundId);
    expect(alert).toMatchObject({ level: "critical", escalate_at: hoursAfterCancelling(72) });
  });

  it("resolves the alert when the refund is marked done", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });
    await openOverdueAlerts(hoursAfterCancelling(24));
    const doneAt = hoursAfterCancelling(26);

    await markRefundDone(
      { store: new DrizzleRefundStore(db), clock: { now: () => doneAt } },
      { refundId: refund.refundId, locationId: refund.locationId, actorId: await aUserOf(refund.locationId) },
    );

    expect(await alertsOf(refund.refundId)).toMatchObject([{ resolved_at: doneAt }]);
  });

  it("skips a refund that a request is marking done at that moment, opening no alert for it", async () => {
    const refund = await aPendingRefundOfCancelledSale(db, { cancelledAt: CANCELLED_AT });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let announceLocked: () => void = () => {};
    const locked = new Promise<void>((resolve) => {
      announceLocked = resolve;
    });
    const marking = new DrizzleRefundStore(db).transaction(async (tx) => {
      await tx.lockRefund(refund.refundId, refund.locationId);
      announceLocked();
      await gate;
    });
    await locked;

    const outcome = await openOverdueAlerts(hoursAfterCancelling(24));
    release();
    await marking;

    expect(outcome).toEqual({ kind: "opened", refundIds: [] });
    expect(await alertsOf(refund.refundId)).toEqual([]);
  });
});

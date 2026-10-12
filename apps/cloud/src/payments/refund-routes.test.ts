import {
  discardedRefundSchema,
  markedRefundDoneSchema,
  pendingRefundsSchema,
} from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { alerts, auditLog, paymentRefunds } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { applyCancelledSale } from "../sales/test-support/applied-sales.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { aTransferCancelledSale } from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerRefundRoutes } from "./refund-routes.js";
import { aPendingRefundOfCancelledSale } from "./test-support/cancelled-sale-refund-fixtures.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const UNKNOWN_REFUND = "00000000-0000-4000-8000-000000000000";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  app = Fastify();
  registerRefundRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOW });
});

afterEach(async () => {
  await app.close();
});

function pendingRefunds(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/refunds/pending", headers });
}

function markDone(headers: Record<string, string>, refundId: string) {
  return app.inject({ method: "POST", url: `/refunds/${refundId}/completion`, headers });
}

function discard(headers: Record<string, string>, refundId: string) {
  return app.inject({ method: "POST", url: `/refunds/${refundId}/discard`, headers });
}

async function aPendingRefund(): Promise<string> {
  const { deviceId } = await insertEnrolledInstallation(db, { now: NOW });
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
  return refund.id;
}

describe.each([
  ["GET /refunds/pending", (headers: Record<string, string>) => pendingRefunds(headers)],
  [
    "POST /refunds/:id/completion",
    (headers: Record<string, string>) => markDone(headers, UNKNOWN_REFUND),
  ],
  [
    "POST /refunds/:id/discard",
    (headers: Record<string, string>) => discard(headers, UNKNOWN_REFUND),
  ],
])("%s access", (_name, request) => {
  it("returns 401 when no session cookie was sent", async () => {
    const response = await request({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);

    const response = await request({ ...headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user who may not confirm refunds", async () => {
    const { headers } = await signedInWith(db, ["view_reports"], NOW);

    const response = await request(headers);

    expect(response.statusCode).toBe(403);
  });
});

describe("GET /refunds/pending", () => {
  it("lists the pending refunds of the branch of the session", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const refundId = await aPendingRefund();

    const response = await pendingRefunds(headers);

    expect(response.statusCode).toBe(200);
    const body = pendingRefundsSchema.parse(response.json());
    expect(body.refunds.map((refund) => refund.id)).toEqual([refundId]);
  });

  it("lists the refund of a late payment beside the refunds of cancelled sales, each with its origin and whether it can be discarded", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const cancelledId = await aPendingRefund();
    const late = await aPendingLatePaymentRefund(db, {
      openedAt: new Date("2026-10-06T10:00:00.000Z"),
      registerName: "Caja 2",
    });

    const response = await pendingRefunds(headers);

    const body = pendingRefundsSchema.parse(response.json());
    expect(
      body.refunds.map(({ id, origin, discardable, method, cancelled_by }) => ({
        id,
        origin,
        discardable,
        method,
        cancelled_by,
      })),
    ).toEqual([
      {
        id: late.refundId,
        origin: "late_payment",
        discardable: true,
        method: "QR",
        cancelled_by: null,
      },
      {
        id: cancelledId,
        origin: "sale_cancelled",
        discardable: false,
        method: "TRANSFER",
        cancelled_by: expect.any(String),
      },
    ]);
  });

  it("tells how long each refund has been pending, when its sale happened and which methods covered it", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, {
      openedAt: new Date(NOW.getTime() - 2 * 3_600_000),
      coveredBy: ["TRANSFER"],
    });

    const response = await pendingRefunds(headers);

    const [refund] = pendingRefundsSchema.parse(response.json()).refunds;
    expect(refund).toMatchObject({
      id: late.refundId,
      seconds_pending: 7_200,
      sale_occurred_at: late.saleOccurredAt.toISOString(),
      covered_by: ["TRANSFER"],
    });
  });

  it("tells the Mercado Pago order of a late payment refund that names one, and none for the others", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const cancelledId = await aPendingRefund();
    const late = await aPendingLatePaymentRefund(db, {
      openedAt: new Date("2026-10-06T10:00:00.000Z"),
      registerName: "Caja 2",
      providerOrderId: "ORD01SECOND",
    });

    const response = await pendingRefunds(headers);

    const body = pendingRefundsSchema.parse(response.json());
    expect(body.refunds.map(({ id, provider_order_id }) => [id, provider_order_id])).toEqual([
      [late.refundId, "ORD01SECOND"],
      [cancelledId, null],
    ]);
  });

  it("lists nothing to a session of another branch", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW, {
      locationId: otherLocationId,
    });
    await aPendingRefund();

    const response = await pendingRefunds(headers);

    expect(response.json()).toEqual({ refunds: [] });
  });
});

describe("POST /refunds/:id/completion", () => {
  it("marks the pending refund as done by the person of the session", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const refundId = await aPendingRefund();

    const response = await markDone(headers, refundId);

    expect(response.statusCode).toBe(200);
    expect(markedRefundDoneSchema.parse(response.json())).toEqual({
      refund_id: refundId,
      done_at: NOW.toISOString(),
    });
    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
    expect(refund).toMatchObject({ state: "APPROVED", doneBy: userId, doneAt: NOW });
  });

  it("resolves the alert of a late-payment refund when it is marked as done", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });

    const response = await markDone(headers, late.refundId);

    expect(response.statusCode).toBe(200);
    const [alert] = await db.select().from(alerts).where(eq(alerts.id, late.alertId));
    expect(alert).toMatchObject({ resolvedAt: NOW, resolvedBy: userId });
  });

  it("resolves the refund task alert of a cancelled sale's refund when it is marked as done", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const forgotten = await aPendingRefundOfCancelledSale(db, { cancelledAt: NOW });
    const [alert] = await db
      .insert(alerts)
      .values({
        kind: "refund_task",
        scope: forgotten.refundId,
        level: "warning",
        audience: "local",
        locationId: forgotten.locationId,
        detail: {},
        openedAt: NOW,
      })
      .returning({ id: alerts.id });

    const response = await markDone(headers, forgotten.refundId);

    expect(response.statusCode).toBe(200);
    const [resolved] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, alert?.id ?? ""));
    expect(resolved).toMatchObject({ resolvedAt: NOW, resolvedBy: userId });
  });

  it("answers 409 to a refund that was discarded", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });
    await discard(headers, late.refundId);

    const response = await markDone(headers, late.refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "refund_discarded" });
  });

  it("answers 409 to a refund that was already marked as done", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const refundId = await aPendingRefund();
    await markDone(headers, refundId);

    const response = await markDone(headers, refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_done" });
  });

  it("answers 404 to a refund that does not exist", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);

    const response = await markDone(headers, UNKNOWN_REFUND);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "refund_not_found" });
  });

  it("answers 400 to an id that is not a record id", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);

    const response = await markDone(headers, "refund-1");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

describe("POST /refunds/:id/discard", () => {
  it("discards the pending refund of a late payment, on behalf of the person of the session", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });

    const response = await discard(headers, late.refundId);

    expect(response.statusCode).toBe(200);
    expect(discardedRefundSchema.parse(response.json())).toEqual({
      refund_id: late.refundId,
      discarded_at: NOW.toISOString(),
    });
    const [refund] = await db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.id, late.refundId));
    expect(refund).toMatchObject({ state: "DISCARDED", discardedBy: userId, discardedAt: NOW });
  });

  it("writes the same kind of audit row as marking a refund as done, and resolves the alert", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });

    await discard(headers, late.refundId);

    const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, late.refundId));
    expect(audit).toMatchObject({
      entity: "payment_refund",
      actorId: userId,
      previousValue: { state: "PENDING" },
      newValue: { state: "DISCARDED", discardedAt: NOW.toISOString() },
    });
    const [alert] = await db.select().from(alerts).where(eq(alerts.id, late.alertId));
    expect(alert).toMatchObject({ resolvedAt: NOW, resolvedBy: userId });
  });

  it("no longer lists the refund once discarded", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });
    await discard(headers, late.refundId);

    const response = await pendingRefunds(headers);

    expect(response.json()).toEqual({ refunds: [] });
  });

  it("answers 409 to the refund of a cancelled sale, which cannot be discarded", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const refundId = await aPendingRefund();

    const response = await discard(headers, refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "refund_not_discardable" });
    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
    expect(refund).toMatchObject({ state: "PENDING" });
  });

  it("answers 409 to a refund that was already marked as done", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });
    await markDone(headers, late.refundId);

    const response = await discard(headers, late.refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_done" });
  });

  it("answers 409 to a refund that was already discarded", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });
    await discard(headers, late.refundId);

    const response = await discard(headers, late.refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_discarded" });
  });

  it("answers 404 to a refund that does not exist", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);

    const response = await discard(headers, UNKNOWN_REFUND);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "refund_not_found" });
  });

  it("answers 404 to a refund of another branch", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW, {
      locationId: otherLocationId,
    });
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW });

    const response = await discard(headers, late.refundId);

    expect(response.statusCode).toBe(404);
  });

  it("answers 400 to an id that is not a record id", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);

    const response = await discard(headers, "refund-1");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

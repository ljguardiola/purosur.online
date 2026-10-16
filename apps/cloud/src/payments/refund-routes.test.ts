import {
  confirmedRefundSchema,
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
import {
  aStandaloneTerminalCancelledSale,
  aTransferCancelledSale,
} from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerRefundRoutes } from "./refund-routes.js";
import { aPendingRefundOfCancelledSale } from "./test-support/cancelled-sale-refund-fixtures.js";
import { FakeMercadoPagoOrders, ORDER_ID } from "./test-support/fake-mercado-pago-orders.js";
import { aPendingLatePaymentRefund } from "./test-support/late-payment-refund-fixtures.js";
import {
  aPendingPointRefundOfCancelledSale,
  aPendingQrRefundOfCancelledSale,
} from "./test-support/mercado-pago-refund-fixtures.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const UNKNOWN_REFUND = "00000000-0000-4000-8000-000000000000";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let mercadoPago: FakeMercadoPagoOrders;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  mercadoPago = new FakeMercadoPagoOrders();
  await serve({ mercadoPago });
});

async function serve(sending: { mercadoPago: FakeMercadoPagoOrders } | undefined) {
  await app?.close();
  app = Fastify();
  registerRefundRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOW,
    ...(sending
      ? {
          sending: {
            mercadoPago: sending.mercadoPago,
            connections: { withConnection: (work) => work(db) },
          },
        }
      : {}),
  });
}

afterEach(async () => {
  await app.close();
});

function pendingRefunds(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/refunds/pending", headers });
}

function markDone(headers: Record<string, string>, refundId: string) {
  return app.inject({ method: "POST", url: `/refunds/${refundId}/completion`, headers });
}

function confirm(headers: Record<string, string>, refundId: string) {
  return app.inject({ method: "POST", url: `/refunds/${refundId}/confirmation`, headers });
}

function discard(headers: Record<string, string>, refundId: string) {
  return app.inject({ method: "POST", url: `/refunds/${refundId}/discard`, headers });
}

async function aPendingRefund(
  overrides: ReturnType<typeof aTransferCancelledSale> = aTransferCancelledSale(),
): Promise<string> {
  const { deviceId } = await insertEnrolledInstallation(db, { now: NOW });
  const cancelled = await applyCancelledSale(db, {
    deviceId,
    cancelledAt: NOW,
    total: 2_000,
    overrides,
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
  [
    "POST /refunds/:id/confirmation",
    (headers: Record<string, string>) => confirm(headers, UNKNOWN_REFUND),
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

  it("lists the pending refund of a standalone terminal payment with its method", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const refundId = await aPendingRefund(aStandaloneTerminalCancelledSale());

    const response = await pendingRefunds(headers);

    const body = pendingRefundsSchema.parse(response.json());
    expect(body.refunds.map(({ id, method }) => ({ id, method }))).toEqual([
      { id: refundId, method: "STANDALONE_TERMINAL" },
    ]);
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

describe("GET /refunds/pending, a QR refund of a cancelled sale", () => {
  it("lists it as one the cloud sends, at the stage the domain answers for it", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });

    const body = pendingRefundsSchema.parse((await pendingRefunds(headers)).json());

    expect(body.refunds).toEqual([
      expect.objectContaining({
        id: pending.refundId,
        method: "QR",
        sent_by_cloud: true,
        delivery_stage: "unconfirmed",
        last_refusal_reason: null,
      }),
    ]);
  });

  it("lists a refund of another method as one a person carries out", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    await aPendingRefund();

    const body = pendingRefundsSchema.parse((await pendingRefunds(headers)).json());

    expect(body.refunds.map((refund) => [refund.sent_by_cloud, refund.delivery_stage])).toEqual([
      [false, null],
    ]);
  });
});

describe("POST /refunds/:id/completion, a QR refund of a cancelled sale", () => {
  it("answers 409 and leaves the refund pending, because the cloud sends it to Mercado Pago", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });

    const response = await markDone(headers, pending.refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "refund_sent_by_cloud" });
    const [refund] = await db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.id, pending.refundId));
    expect(refund?.state).toBe("PENDING");
  });
});

describe("POST /refunds/:id/completion, a late QR payment refund", () => {
  it("answers 409 and leaves the refund pending, because the cloud sends it to Mercado Pago", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });

    const response = await markDone(headers, late.refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "refund_sent_by_cloud" });
    const [refund] = await db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.id, late.refundId));
    expect(refund).toMatchObject({ state: "PENDING" });
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

  it("marks the pending refund of a standalone terminal payment as done by the person of the session", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const refundId = await aPendingRefund(aStandaloneTerminalCancelledSale());

    const response = await markDone(headers, refundId);

    expect(response.statusCode).toBe(200);
    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
    expect(refund).toMatchObject({
      method: "STANDALONE_TERMINAL",
      state: "APPROVED",
      doneBy: userId,
      doneAt: NOW,
    });
  });

  it("resolves the alert of a late-payment refund when it is marked as done", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, method: "POINT" });

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

describe("a Point refund of a cancelled sale", () => {
  async function storedRefund(refundId: string) {
    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
    return refund;
  }

  it("is listed as one the cloud sends, unconfirmed", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingPointRefundOfCancelledSale(db, { cancelledAt: NOW });

    const body = pendingRefundsSchema.parse((await pendingRefunds(headers)).json());

    expect(body.refunds).toEqual([
      expect.objectContaining({
        id: pending.refundId,
        method: "POINT",
        sent_by_cloud: true,
        delivery_stage: "unconfirmed",
        last_refusal_reason: null,
      }),
    ]);
  });

  it("is never marked done by hand, because the cloud sends it to Mercado Pago", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingPointRefundOfCancelledSale(db, { cancelledAt: NOW });

    const response = await markDone(headers, pending.refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "refund_sent_by_cloud" });
    expect((await storedRefund(pending.refundId))?.state).toBe("PENDING");
  });

  it("is confirmed on behalf of the person of the session, and Mercado Pago is asked to refund the order, leaving it pending while it is in process", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingPointRefundOfCancelledSale(db, { cancelledAt: NOW });

    const response = await confirm(headers, pending.refundId);

    expect(response.statusCode).toBe(200);
    expect(confirmedRefundSchema.parse(response.json())).toEqual({
      refund_id: pending.refundId,
      outcome: "sent",
    });
    const refund = await storedRefund(pending.refundId);
    expect(refund).toMatchObject({
      state: "PENDING",
      confirmedBy: userId,
      confirmedAt: NOW,
      sentAt: NOW,
      providerRefundId: "REF01JQ4S4KY8HWQ6NA5PXB65B3D3",
    });
    expect(mercadoPago.refunds).toEqual([
      { orderId: ORDER_ID, idempotencyKey: refund?.attemptKey },
    ]);
  });
});

describe("POST /refunds/:id/confirmation", () => {
  async function storedRefund(refundId: string) {
    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
    return refund;
  }

  it("confirms the refund on behalf of the person of the session and asks Mercado Pago to refund the order, leaving it pending while it is in process", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });

    const response = await confirm(headers, pending.refundId);

    expect(response.statusCode).toBe(200);
    expect(confirmedRefundSchema.parse(response.json())).toEqual({
      refund_id: pending.refundId,
      outcome: "sent",
    });
    const refund = await storedRefund(pending.refundId);
    expect(refund).toMatchObject({
      state: "PENDING",
      confirmedBy: userId,
      confirmedAt: NOW,
      sentAt: NOW,
      providerRefundId: "REF01JQ4S4KY8HWQ6NA5PXB65B3D3",
    });
    expect(mercadoPago.refunds).toEqual([
      { orderId: ORDER_ID, idempotencyKey: refund?.attemptKey },
    ]);
  });

  it("marks the refund done by the person who confirmed it, resolving its refund task alert, when Mercado Pago already processed it", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
    const [alert] = await db
      .insert(alerts)
      .values({
        kind: "refund_task",
        scope: pending.refundId,
        level: "warning",
        audience: "local",
        locationId: pending.locationId,
        detail: {},
        openedAt: NOW,
      })
      .returning({ id: alerts.id });
    mercadoPago.refund = { kind: "refunded", providerRefundId: "REF-1", processed: true };

    const response = await confirm(headers, pending.refundId);

    expect(confirmedRefundSchema.parse(response.json())).toEqual({
      refund_id: pending.refundId,
      outcome: "done",
      done_at: NOW.toISOString(),
    });
    expect(await storedRefund(pending.refundId)).toMatchObject({
      state: "APPROVED",
      doneBy: userId,
      doneAt: NOW,
    });
    const [resolved] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.id, alert?.id ?? ""));
    expect(resolved).toMatchObject({ resolvedAt: NOW, resolvedBy: userId });
  });

  it("leaves an audit entry for the confirmation", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });

    await confirm(headers, pending.refundId);

    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, pending.refundId));
    expect(audits).toContainEqual(
      expect.objectContaining({ entity: "payment_refund", actorId: userId, at: NOW }),
    );
  });

  it.each([
    [
      "insufficient_balance",
      { kind: "insufficient_balance" } as const,
      { outcome: "insufficient_balance" },
    ],
    [
      "refused",
      { kind: "refused", reason: "refund_period_exceeded" } as const,
      { outcome: "refused", reason: "refund_period_exceeded" },
    ],
    ["provider_unavailable", { kind: "unavailable" } as const, { outcome: "provider_unavailable" }],
  ])(
    "answers 200 with the %s outcome, the confirmation standing",
    async (_name, answer, expected) => {
      const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
      const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
      mercadoPago.refund = answer;

      const response = await confirm(headers, pending.refundId);

      expect(response.statusCode).toBe(200);
      expect(confirmedRefundSchema.parse(response.json())).toEqual({
        refund_id: pending.refundId,
        ...expected,
      });
      expect(await storedRefund(pending.refundId)).toMatchObject({
        state: "PENDING",
        confirmedBy: userId,
      });
    },
  );

  type Setup = () => Promise<string>;
  const markRefund = (refundId: string, values: Partial<typeof paymentRefunds.$inferInsert>) =>
    db.update(paymentRefunds).set(values).where(eq(paymentRefunds.id, refundId));

  it.each<[string, string, Setup]>([
    ["refund_not_confirmable", "a refund of another method", () => aPendingRefund()],
    [
      "already_done",
      "a refund already done",
      async () => {
        const { refundId } = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
        await markRefund(refundId, { state: "APPROVED", doneBy: "manager", doneAt: NOW });
        return refundId;
      },
    ],
    [
      "already_confirmed",
      "a refund already confirmed",
      async () => {
        const { refundId } = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
        await markRefund(refundId, { confirmedBy: "manager", confirmedAt: NOW });
        return refundId;
      },
    ],
    [
      "refund_not_backed",
      "a refund whose cancelling event the cloud does not hold",
      async () =>
        (await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW, cancellingEvent: false }))
          .refundId,
    ],
    [
      "exceeds_refundable",
      "a refund over what its payment still holds",
      async () => {
        const { refundId } = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
        await markRefund(refundId, { amount: 2_451 });
        return refundId;
      },
    ],
  ])("answers 409 %s to %s, sending nothing", async (code, _scenario, setUp) => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const refundId = await setUp();

    const response = await confirm(headers, refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code });
    expect(mercadoPago.refunds).toEqual([]);
  });

  it("answers 404 to a refund that does not exist", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);

    const response = await confirm(headers, UNKNOWN_REFUND);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "refund_not_found" });
  });

  it("answers 404 to a refund of another branch", async () => {
    const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });
    const locationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW, { locationId });

    const response = await confirm(headers, pending.refundId);

    expect(response.statusCode).toBe(404);
    expect(mercadoPago.refunds).toEqual([]);
  });

  it("answers 503 and sends nothing when Mercado Pago is not configured", async () => {
    await serve(undefined);
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const pending = await aPendingQrRefundOfCancelledSale(db, { cancelledAt: NOW });

    const response = await confirm(headers, pending.refundId);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "payment_provider_not_configured" });
    expect((await storedRefund(pending.refundId))?.confirmedAt).toBeNull();
  });

  it("answers 400 to an id that is not a record id", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);

    const response = await confirm(headers, "refund-1");

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
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, method: "POINT" });
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

describe("a late QR payment refund", () => {
  async function storedRefund(refundId: string) {
    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
    return refund;
  }

  it("is listed as one the cloud sends, unconfirmed and discardable, then as confirmed and no longer discardable", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });
    const listed = async () =>
      pendingRefundsSchema
        .parse((await pendingRefunds(headers)).json())
        .refunds.map(({ sent_by_cloud, delivery_stage, discardable }) => ({
          sent_by_cloud,
          delivery_stage,
          discardable,
        }));

    expect(await listed()).toEqual([
      { sent_by_cloud: true, delivery_stage: "unconfirmed", discardable: true },
    ]);

    await confirm(headers, late.refundId);

    expect(await listed()).toEqual([
      { sent_by_cloud: true, delivery_stage: "sent", discardable: false },
    ]);
  });

  it("is confirmed on behalf of the person of the session, and Mercado Pago is asked to refund the order the payment arrived on", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });

    const response = await confirm(headers, late.refundId);

    expect(response.statusCode).toBe(200);
    expect(confirmedRefundSchema.parse(response.json())).toEqual({
      refund_id: late.refundId,
      outcome: "sent",
    });
    const refund = await storedRefund(late.refundId);
    expect(refund).toMatchObject({ state: "PENDING", confirmedBy: userId, confirmedAt: NOW });
    expect(mercadoPago.refunds).toEqual([
      { orderId: ORDER_ID, idempotencyKey: refund?.attemptKey },
    ]);
  });

  it("is done, with its alert resolved, when Mercado Pago already processed it", async () => {
    const { headers, userId } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });
    mercadoPago.refund = { kind: "refunded", providerRefundId: "REF-1", processed: true };

    const response = await confirm(headers, late.refundId);

    expect(confirmedRefundSchema.parse(response.json())).toMatchObject({ outcome: "done" });
    expect(await storedRefund(late.refundId)).toMatchObject({ state: "APPROVED", doneBy: userId });
    const [alert] = await db.select().from(alerts).where(eq(alerts.id, late.alertId));
    expect(alert).toMatchObject({ resolvedAt: NOW, resolvedBy: userId });
  });

  it("is refused to be confirmed when it is the refund of a POINT payment", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, {
      openedAt: NOW,
      orderId: ORDER_ID,
      method: "POINT",
    });

    const response = await confirm(headers, late.refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "refund_not_confirmable" });
  });

  it("is discarded while no person confirmed it", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });

    const response = await discard(headers, late.refundId);

    expect(response.statusCode).toBe(200);
    expect(await storedRefund(late.refundId)).toMatchObject({ state: "DISCARDED" });
    expect(mercadoPago.refunds).toEqual([]);
  });

  it("answers 409 refund_already_confirmed to a discard once a person confirmed it, leaving it as it was", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);
    const late = await aPendingLatePaymentRefund(db, { openedAt: NOW, orderId: ORDER_ID });
    await confirm(headers, late.refundId);

    const response = await discard(headers, late.refundId);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "refund_already_confirmed" });
    expect(await storedRefund(late.refundId)).toMatchObject({ state: "PENDING" });
    const [alert] = await db.select().from(alerts).where(eq(alerts.id, late.alertId));
    expect(alert?.resolvedAt).toBeNull();
  });
});

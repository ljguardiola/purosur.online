import { markedRefundDoneSchema, pendingRefundsSchema } from "@purosur/contracts";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { paymentRefunds } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  BACKOFFICE_ORIGIN,
  insertLocation,
  signedInWith,
} from "../stock/test-support/stock-route-fixtures.js";
import { aTransferCancelledSale } from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerRefundRoutes } from "./refund-routes.js";
import { applyCancelledSale } from "./test-support/applied-sales.js";

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

  it("answers 404 to a refund of another branch and leaves it pending", async () => {
    const otherLocationId = await insertLocation(db);
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW, {
      locationId: otherLocationId,
    });
    const refundId = await aPendingRefund();

    const response = await markDone(headers, refundId);

    expect(response.statusCode).toBe(404);
    const [refund] = await db.select().from(paymentRefunds).where(eq(paymentRefunds.id, refundId));
    expect(refund).toMatchObject({ state: "PENDING", doneBy: null });
  });

  it("answers 400 to an id that is not a record id", async () => {
    const { headers } = await signedInWith(db, ["confirm_refunds"], NOW);

    const response = await markDone(headers, "refund-1");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });
});

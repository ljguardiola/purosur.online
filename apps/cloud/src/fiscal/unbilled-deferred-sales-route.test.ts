import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fiscalTasks, locations, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { fixedZoneRulesSource } from "../test-support/fixed-zone-rules-source.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import {
  insertDeferredSaleRow,
  insertDeferredSaleTaskRow,
} from "./test-support/deferred-sale-fixtures.js";
import { registerUnbilledDeferredSalesRoute } from "./unbilled-deferred-sales-route.js";

const DECEMBER_30 = new Date("2025-12-30T15:00:00.000Z");
const JANUARY_2 = new Date("2026-01-02T15:00:00.000Z");

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
  registerUnbilledDeferredSalesRoute(app, {
    zoneRules: fixedZoneRulesSource(),
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function readCounter(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/fiscal/unbilled-deferred-sales", headers });
}

async function aFiscalInformationSession() {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys: ["view_fiscal_documents"],
  });
}

describe("GET /fiscal/unbilled-deferred-sales", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await readCounter({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without access to fiscal information with 403 forbidden", async () => {
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId: await seededLocationId(db),
      permissionKeys: ["enroll_register_devices"],
    });

    const response = await readCounter(session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("answers none and no oldest when no deferred sale waits to be invoiced", async () => {
    const session = await aFiscalInformationSession();

    const response = await readCounter(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: 0, oldest: null });
  });

  it("counts the pending deferred sales and the expired ones whose task is open, and tells the age of the oldest", async () => {
    const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const session = await aFiscalInformationSession();
    await insertDeferredSaleRow(db, { ...installation, occurredAt: JANUARY_2 });
    const expired = await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: DECEMBER_30,
      state: "expired",
      expiredAt: SESSION_NOON,
    });
    await insertDeferredSaleTaskRow(db, {
      registerId: installation.registerId,
      deferredSaleId: expired.id,
    });

    const response = await readCounter(session.headers);

    expect(response.json()).toEqual({
      count: 2,
      oldest: { occurred_at: "2025-12-30T15:00:00.000Z", age_days: 6 },
    });
  });

  it("leaves out the satisfied and cancelled deferred sales and the expired ones whose task is closed", async () => {
    const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const session = await aFiscalInformationSession();
    await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: DECEMBER_30,
      state: "satisfied",
      satisfiedAt: SESSION_NOON,
    });
    await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: DECEMBER_30,
      state: "cancelled",
      cancelledAt: SESSION_NOON,
    });
    const expired = await insertDeferredSaleRow(db, {
      ...installation,
      occurredAt: DECEMBER_30,
      state: "expired",
      expiredAt: SESSION_NOON,
    });
    const taskId = await insertDeferredSaleTaskRow(db, {
      registerId: installation.registerId,
      deferredSaleId: expired.id,
    });
    await db
      .update(fiscalTasks)
      .set({ state: "closed", closedAt: SESSION_NOON })
      .where(eq(fiscalTasks.id, taskId));

    const response = await readCounter(session.headers);

    expect(response.json()).toEqual({ count: 0, oldest: null });
  });

  it("leaves out the deferred sales of another branch", async () => {
    const installation = await insertEnrolledInstallation(db, { now: SESSION_NOON });
    const session = await aFiscalInformationSession();
    await insertDeferredSaleRow(db, { ...installation, occurredAt: JANUARY_2 });
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: otherLocation.id, name: "Caja 9" })
      .returning({ id: registers.id });
    if (!otherRegister) {
      throw new Error("test setup: seeding the other branch's register returned no row");
    }
    await insertDeferredSaleRow(db, {
      registerId: otherRegister.id,
      locationId: otherLocation.id,
      occurredAt: DECEMBER_30,
    });

    const response = await readCounter(session.headers);

    expect(response.json()).toEqual({
      count: 1,
      oldest: { occurred_at: "2026-01-02T15:00:00.000Z", age_days: 3 },
    });
  });
});

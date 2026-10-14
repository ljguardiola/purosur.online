import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { locations, pointOfSaleClaims, registers, users } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { registerFortnightPresentationsListRoute } from "./fortnight-presentations-list-route.js";
import { configureOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const DECEMBER_SECOND_HALF = { start: "2025-12-16", end: "2025-12-31" };
const OFFLINE_POINT_OF_SALE = 8;

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
  registerFortnightPresentationsListRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function listPresentations(headers: Record<string, string>) {
  return app.inject({ method: "GET", url: "/registers/fortnight-presentations", headers });
}

async function keepDecemberCode(pointOfSaleNumber: number) {
  await testDatabase.asMigrator(() =>
    db
      .update(pointOfSaleClaims)
      .set({ claimedAt: new Date("2025-12-01T12:00:00.000Z") })
      .where(eq(pointOfSaleClaims.pointOfSaleNumber, pointOfSaleNumber)),
  );
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(
    DECEMBER_SECOND_HALF,
    (acquisition) =>
      acquisition.keep({
        code: {
          code: "36123456789012",
          fortnight: DECEMBER_SECOND_HALF,
          reportDeadline: "2026-01-09",
        },
        obtainedAt: new Date("2025-12-10T12:00:00.000Z"),
        obtainedThrough: "requested",
      }),
  );
}

describe("GET /registers/fortnight-presentations", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await listPresentations({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden", async () => {
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId: await seededLocationId(db),
      permissionKeys: ["enroll_register_devices"],
    });

    const response = await listPresentations(session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the session's branch presentations with their state and deadline, and none of another branch's", async () => {
    const registerId = await configureOfflinePointOfSale(db, {
      registerName: "caja-1",
      realTimePointOfSale: 7,
      offlinePointOfSale: OFFLINE_POINT_OF_SALE,
      now: SESSION_NOON,
    });
    await keepDecemberCode(OFFLINE_POINT_OF_SALE);
    await new DrizzleFortnightReportStore(db).holdReport(
      { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight: DECEMBER_SECOND_HALF },
      (report) => report.record({ state: "blocked", at: SESSION_NOON }),
    );
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    const [actor] = await db.select({ id: users.id }).from(users);
    if (!otherLocation || !actor) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: otherLocation.id, name: "Caja 9" })
      .returning({ id: registers.id });
    if (!otherRegister) {
      throw new Error("test setup: seeding the other branch's register returned no row");
    }
    await db.insert(pointOfSaleClaims).values({
      pointOfSaleNumber: 21,
      registerId: otherRegister.id,
      mechanism: "offline",
      claimedBy: actor.id,
    });
    await testDatabase.asMigrator(() =>
      db
        .update(pointOfSaleClaims)
        .set({ claimedAt: new Date("2025-12-01T12:00:00.000Z") })
        .where(eq(pointOfSaleClaims.pointOfSaleNumber, 21)),
    );
    const session = await openBackofficeSession(db, {
      now: SESSION_NOON,
      locationId: await seededLocationId(db),
      permissionKeys: ["change_fiscal_configuration"],
      passkeyAuthorized: false,
    });

    const response = await listPresentations(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        register_id: registerId,
        point_of_sale_number: OFFLINE_POINT_OF_SALE,
        fortnight_start: "2025-12-16",
        fortnight_end: "2025-12-31",
        deadline: "2026-01-08",
        state: "blocked",
      },
    ]);
  });
});

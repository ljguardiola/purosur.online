import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  locations,
  offlinePointOfSaleRetirements,
  registers,
} from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerOfflinePointOfSaleRetirementRoute } from "./offline-point-of-sale-retirement-route.js";
import {
  configureOfflinePointOfSale,
  moveRegisterToOfflinePointOfSale,
} from "./test-support/offline-point-of-sale-fixtures.js";

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
  registerOfflinePointOfSaleRetirementRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function sessionWith(
  permissionKeys: string[],
  passkeyAuthorized = true,
): Promise<BackofficeSession> {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys,
    passkeyAuthorized,
  });
}

async function seedReleasedOfflineNumber(offlinePointOfSale: number, moveTo: number) {
  const registerId = await configureOfflinePointOfSale(db, {
    registerName: "Caja 1",
    realTimePointOfSale: 7,
    offlinePointOfSale,
    now: SESSION_NOON,
  });
  await moveRegisterToOfflinePointOfSale(db, {
    registerId,
    pointOfSaleNumber: moveTo,
    version: 1,
    now: SESSION_NOON,
  });
  return registerId;
}

function retire(number: string | number, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: `/registers/offline-points-of-sale/${number}/retirement`,
    headers,
  });
}

async function retirements() {
  return db.select().from(offlinePointOfSaleRetirements);
}

describe("POST /registers/offline-points-of-sale/:number/retirement", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    await seedReleasedOfflineNumber(8, 9);

    const response = await retire(8, { origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    await seedReleasedOfflineNumber(8, 9);
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await retire(8, { ...session.headers, origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await retirements()).toEqual([]);
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden, changing nothing", async () => {
    await seedReleasedOfflineNumber(8, 9);
    const session = await sessionWith(["enroll_register_devices"]);

    const response = await retire(8, session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await retirements()).toEqual([]);
  });

  it("answers a number that is not a point of sale number with 400 validation_failed, before asking for a passkey", async () => {
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const responses = await Promise.all(
      ["abc", "0", "100000", "8.5"].map((n) => retire(n, session.headers)),
    );

    for (const response of responses) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "validation_failed",
        details: [{ field: "number" }],
      });
    }
  });

  it("returns 401 authorization_required without a recent passkey, even for a number that does not exist, changing nothing", async () => {
    await seedReleasedOfflineNumber(8, 9);
    const session = await sessionWith(["change_fiscal_configuration"], false);

    const response = await retire(8, session.headers);
    const absent = await retire(500, session.headers);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(absent.statusCode).toBe(401);
    expect(await retirements()).toEqual([]);
  });

  it("answers 404 not_found for a number of another branch's register and for a real-time number", async () => {
    await seedReleasedOfflineNumber(8, 9);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    await db.update(registers).set({ locationId: otherLocation.id });
    const session = await sessionWith(["change_fiscal_configuration"]);

    const otherBranch = await retire(8, session.headers);
    const realTime = await retire(7, session.headers);

    expect(otherBranch.statusCode).toBe(404);
    expect(otherBranch.json()).toMatchObject({ code: "not_found" });
    expect(realTime.statusCode).toBe(404);
    expect(await retirements()).toEqual([]);
  });

  it("answers 409 assigned for a number a register has assigned, changing nothing", async () => {
    await seedReleasedOfflineNumber(8, 9);
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await retire(9, session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "assigned" });
    expect(await retirements()).toEqual([]);
  });

  it("answers 409 already_retired for a number already retired, keeping the first retirement", async () => {
    await seedReleasedOfflineNumber(8, 9);
    const session = await sessionWith(["change_fiscal_configuration"]);
    await retire(8, session.headers);

    const response = await retire(8, session.headers);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "already_retired" });
    expect(await retirements()).toHaveLength(1);
  });

  it("retires the number, answering when, audited under the actor", async () => {
    const registerId = await seedReleasedOfflineNumber(8, 9);
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await retire("8", session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      point_of_sale_number: 8,
      retired_at: SESSION_NOON.toISOString(),
    });
    expect(await retirements()).toEqual([
      { pointOfSaleNumber: 8, retiredAt: SESSION_NOON, retiredBy: session.userId },
    ]);
    const entries = (
      await db.select().from(auditLog).where(eq(auditLog.entityId, registerId))
    ).filter(({ entity }) => entity === "offline_point_of_sale");
    expect(entries).toMatchObject([{ actorId: session.userId, at: SESSION_NOON }]);
  });
});

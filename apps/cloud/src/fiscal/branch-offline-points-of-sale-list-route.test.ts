import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { offlinePointOfSaleRetirements, users } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerBranchOfflinePointsOfSaleListRoute } from "./branch-offline-points-of-sale-list-route.js";
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
  registerBranchOfflinePointsOfSaleListRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => SESSION_NOON,
  });
});

afterEach(async () => {
  await app.close();
});

async function sessionWith(permissionKeys: string[]): Promise<BackofficeSession> {
  return openBackofficeSession(db, {
    now: SESSION_NOON,
    locationId: await seededLocationId(db),
    permissionKeys,
    passkeyAuthorized: true,
  });
}

function list(headers: Record<string, string> = {}) {
  return app.inject({ method: "GET", url: "/registers/offline-points-of-sale", headers });
}

describe("GET /registers/offline-points-of-sale", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await list({ origin: BACKOFFICE_ORIGIN });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user holding only the permission to enroll registers with 403 forbidden", async () => {
    const session = await sessionWith(["enroll_register_devices"]);

    const response = await list(session.headers);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the branch's offline points of sale with their register, assignment and retirement", async () => {
    const registerId = await configureOfflinePointOfSale(db, {
      registerName: "Caja 1",
      realTimePointOfSale: 7,
      offlinePointOfSale: 8,
      now: SESSION_NOON,
    });
    await moveRegisterToOfflinePointOfSale(db, {
      registerId,
      pointOfSaleNumber: 9,
      version: 1,
      now: SESSION_NOON,
    });
    const [actor] = await db.select({ id: users.id }).from(users).limit(1);
    if (!actor) {
      throw new Error("test setup: no user seeded");
    }
    await db
      .insert(offlinePointOfSaleRetirements)
      .values({ pointOfSaleNumber: 8, retiredAt: SESSION_NOON, retiredBy: actor.id });
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await list(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        point_of_sale_number: 8,
        register_id: registerId,
        register_name: "Caja 1",
        assigned: false,
        retired_at: SESSION_NOON.toISOString(),
      },
      {
        point_of_sale_number: 9,
        register_id: registerId,
        register_name: "Caja 1",
        assigned: true,
        retired_at: null,
      },
    ]);
  });
});

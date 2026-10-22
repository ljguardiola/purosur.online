import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buyerTaxStatusSets } from "../platform/db/schema.js";
import {
  BACKOFFICE_ORIGIN,
  type BackofficeSession,
  openBackofficeSession,
  SESSION_NOON,
} from "../test-support/backoffice-session.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerBuyerTaxStatusesListRoute } from "./buyer-tax-statuses-list-route.js";

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
  registerBuyerTaxStatusesListRoute(app, {
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
    passkeyAuthorized: false,
  });
}

function list(headers: Record<string, string> = {}) {
  return app.inject({ method: "GET", url: "/registers/buyer-tax-statuses", headers });
}

describe("GET /registers/buyer-tax-statuses", () => {
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

  it("answers the latest set's statuses with their code and description, with no fresh passkey", async () => {
    await db.insert(buyerTaxStatusSets).values({
      paramsVersion: 1,
      options: [{ code: 901, description: "Condicion vieja", invoiceClass: "A" }],
    });
    await db.insert(buyerTaxStatusSets).values({
      paramsVersion: 2,
      options: [
        { code: 901, description: "Condicion de prueba A", invoiceClass: "A" },
        { code: 902, description: "Condicion de prueba B", invoiceClass: "C" },
      ],
    });
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await list(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { code: 901, description: "Condicion de prueba A" },
      { code: 902, description: "Condicion de prueba B" },
    ]);
  });

  it("answers an empty list while no set was recorded", async () => {
    const session = await sessionWith(["change_fiscal_configuration"]);

    const response = await list(session.headers);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});

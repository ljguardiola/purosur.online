import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { brands } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerBrandCreationRoute } from "./brand-creation-route.js";
import {
  insertBrand,
  sessionCookie,
  signedInAsAdministrator,
  signedInWithPermissions,
} from "./test-support/catalog-route-fixtures.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

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
  registerBrandCreationRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function createBrand(
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: "/brands",
    headers: { origin: BACKOFFICE_ORIGIN, ...sessionCookie(rawSessionId), ...headers },
    payload: body,
  });
}

describe("POST /brands", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await createBrand(undefined, { name: "Granix" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, creating nothing", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await createBrand(
      rawSessionId,
      { name: "Granix" },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(brands)).toHaveLength(0);
  });

  it("rejects a user without the products and categories permission with 403 forbidden, creating nothing", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON, ["sell_and_charge"]);

    const response = await createBrand(rawSessionId, { name: "Granix" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(brands)).toHaveLength(0);
  });

  it("creates the brand, active and with no products, for a user holding the products and categories permission", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await createBrand(rawSessionId, { name: "  Dulcor  " });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: body.id,
      name: "Dulcor",
      active: true,
      version: 1,
      productCount: 0,
    });
    expect(await db.select().from(brands).where(eq(brands.id, body.id))).toMatchObject([
      { name: "Dulcor", active: true, version: 1 },
    ]);
  });

  it("creates the brand for an Administrator even without the explicit permission", async () => {
    const rawSessionId = await signedInAsAdministrator(db, NOON);

    const response = await createBrand(rawSessionId, { name: "Dulcor" });

    expect(response.statusCode).toBe(201);
  });

  it("rejects an empty name, creating nothing", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await createBrand(rawSessionId, { name: "   " });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    expect(await db.select().from(brands)).toHaveLength(0);
  });

  it("rejects a name a deactivated brand already has in another letter case with 409 brand_name_taken", async () => {
    await insertBrand(db, { name: "Vitaco", active: false });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await createBrand(rawSessionId, { name: "vitaco" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "brand_name_taken" });
    expect(await db.select().from(brands)).toHaveLength(1);
  });
});

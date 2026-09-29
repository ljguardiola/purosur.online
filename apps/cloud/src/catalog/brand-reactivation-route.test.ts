import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { brands, products } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerBrandReactivationRoute } from "./brand-reactivation-route.js";
import {
  insertBrand,
  insertProductOfBrand,
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
  registerBrandReactivationRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function request(
  rawSessionId: string | undefined,
  id: string,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/brands/${id}/reactivation`,
    headers: { origin: BACKOFFICE_ORIGIN, ...sessionCookie(rawSessionId), ...headers },
    payload: {},
  });
}

async function storedBrand(id: string) {
  const [brand] = await db.select().from(brands).where(eq(brands.id, id));
  return brand;
}

describe("POST /brands/:id/reactivation", () => {
  it("returns 401 unauthenticated when no cookie was sent, changing nothing", async () => {
    const brand = await insertBrand(db, { name: "Granix", active: false });

    const response = await request(undefined, brand.id);

    expect(response.statusCode).toBe(401);
    expect(await storedBrand(brand.id)).toMatchObject({ active: false, version: 1 });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const brand = await insertBrand(db, { name: "Granix", active: false });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, brand.id, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedBrand(brand.id)).toMatchObject({ active: false, version: 1 });
  });

  it("rejects a user without the products and categories permission with 403 forbidden, changing nothing", async () => {
    const brand = await insertBrand(db, { name: "Granix", active: false });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["sell_and_charge"]);

    const response = await request(rawSessionId, brand.id);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await storedBrand(brand.id)).toMatchObject({ active: false, version: 1 });
  });

  it("reactivates the brand, bumping its version and leaving the products that carry it with it", async () => {
    const brand = await insertBrand(db, { name: "Granix", active: false });
    await insertProductOfBrand(db, { name: "Galletitas", brandId: brand.id });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, brand.id);

    expect(response.statusCode).toBe(200);
    expect(await storedBrand(brand.id)).toMatchObject({ active: true, version: 2 });
    expect(await db.select().from(products)).toMatchObject([{ brandId: brand.id }]);
  });

  it("reactivates the brand for an Administrator even without the explicit permission", async () => {
    const brand = await insertBrand(db, { name: "Granix", active: false });
    const rawSessionId = await signedInAsAdministrator(db, NOON);

    const response = await request(rawSessionId, brand.id);

    expect(response.statusCode).toBe(200);
  });

  it("returns 409 brand_already_active for a brand already active, changing nothing", async () => {
    const brand = await insertBrand(db, { name: "Granix", active: true });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, brand.id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "brand_already_active" });
    expect(await storedBrand(brand.id)).toMatchObject({ active: true, version: 1 });
  });

  it.each(["00000000-0000-0000-0000-000000000000", "not-a-uuid"])(
    "returns 404 not_found for the id %s",
    async (id) => {
      const rawSessionId = await signedInWithPermissions(db, NOON);

      const response = await request(rawSessionId, id);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    },
  );
});

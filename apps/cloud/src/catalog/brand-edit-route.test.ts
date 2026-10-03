import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { brands } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerBrandEditRoute } from "./brand-edit-route.js";
import {
  insertBrand,
  insertProductOfBrand,
  sessionCookie,
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
  registerBrandEditRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

function editBrand(
  rawSessionId: string | undefined,
  id: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "PUT",
    url: `/brands/${id}`,
    headers: { origin: BACKOFFICE_ORIGIN, ...sessionCookie(rawSessionId), ...headers },
    payload: body,
  });
}

async function storedBrand(id: string) {
  const [brand] = await db.select().from(brands).where(eq(brands.id, id));
  return brand;
}

describe("PUT /brands/:id", () => {
  it("no longer answers the old edit path", async () => {
    const brand = await insertBrand(db, { name: "Granix", active: true });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await app.inject({
      method: "POST",
      url: `/brands/${brand.id}/edit`,
      headers: { origin: BACKOFFICE_ORIGIN, ...sessionCookie(rawSessionId) },
      payload: { name: "Granix Pro", version: 1 },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const brand = await insertBrand(db, { name: "Granix" });

    const response = await editBrand(undefined, brand.id, { name: "Granix Pro", version: 1 });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const brand = await insertBrand(db, { name: "Granix" });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editBrand(
      rawSessionId,
      brand.id,
      { name: "Granix Pro", version: 1 },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedBrand(brand.id)).toMatchObject({ name: "Granix", version: 1 });
  });

  it("rejects a user without the products and categories permission with 403 forbidden, changing nothing", async () => {
    const brand = await insertBrand(db, { name: "Granix" });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["sell_and_charge"]);

    const response = await editBrand(rawSessionId, brand.id, { name: "Granix Pro", version: 1 });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await storedBrand(brand.id)).toMatchObject({ name: "Granix", version: 1 });
  });

  it("renames the brand, answering it with its active products count", async () => {
    const brand = await insertBrand(db, { name: "Granix" });
    await insertProductOfBrand(db, { name: "Galletitas", brandId: brand.id });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editBrand(rawSessionId, brand.id, { name: " Granix Pro ", version: 1 });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: brand.id,
      name: "Granix Pro",
      active: true,
      version: 2,
      productCount: 1,
    });
    expect(await storedBrand(brand.id)).toMatchObject({ name: "Granix Pro", version: 2 });
  });

  it("answers 400 validation_failed naming id for a malformed id, changing nothing", async () => {
    const brand = await insertBrand(db, { name: "Granix" });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editBrand(rawSessionId, "not-a-uuid", {
      name: "Granix Pro",
      version: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
    expect(await storedBrand(brand.id)).toMatchObject({ name: "Granix", version: 1 });
  });

  it.each(["00000000-0000-0000-0000-000000000000"])(
    "returns 404 not_found for the id %s",
    async (id) => {
      const rawSessionId = await signedInWithPermissions(db, NOON);

      const response = await editBrand(rawSessionId, id, { name: "Granix", version: 1 });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: "not_found" });
    },
  );

  it.each(["00000000-0000-0000-0000-000000000000"])(
    "returns 400 validation_failed for the id %s when the body does not match its shape",
    async (id) => {
      const rawSessionId = await signedInWithPermissions(db, NOON);

      const response = await editBrand(rawSessionId, id, { name: "", version: 1 });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: "validation_failed",
        details: [{ field: "name" }],
      });
    },
  );

  it("answers a brand renamed through its id in uppercase with the id as stored", async () => {
    const brand = await insertBrand(db, { name: "Granix" });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editBrand(rawSessionId, brand.id.toUpperCase(), {
      name: "Granix Pro",
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: brand.id, name: "Granix Pro", version: 2 });
  });

  it("rejects an empty name, changing nothing", async () => {
    const brand = await insertBrand(db, { name: "Granix" });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editBrand(rawSessionId, brand.id, { name: "", version: 1 });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
  });

  it("rejects a name another brand already has in another letter case with 409 brand_name_taken", async () => {
    const brand = await insertBrand(db, { name: "Granix" });
    await insertBrand(db, { name: "Vitaco" });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editBrand(rawSessionId, brand.id, { name: "VITACO", version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "brand_name_taken" });
    expect(await storedBrand(brand.id)).toMatchObject({ name: "Granix", version: 1 });
  });

  it("returns 409 stale_version for a save made over a version someone else already changed", async () => {
    const brand = await insertBrand(db, { name: "Granix", version: 2 });
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await editBrand(rawSessionId, brand.id, { name: "Granix Pro", version: 1 });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    expect(await storedBrand(brand.id)).toMatchObject({ name: "Granix", version: 2 });
  });
});

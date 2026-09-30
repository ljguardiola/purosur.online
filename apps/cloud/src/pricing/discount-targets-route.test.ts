import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertProductWithTags,
  insertTag,
  sessionCookie,
  signedInAsAdministrator,
  signedInWithPermissions,
} from "../catalog/test-support/catalog-route-fixtures.js";
import { categories } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { registerDiscountTargetsRoute } from "./discount-targets-route.js";
import {
  insertCategory,
  OTHER_PERMISSIONS_THAN_PROMOTIONS,
} from "./test-support/discount-route-fixtures.js";

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
  registerDiscountTargetsRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
});

afterEach(async () => {
  await app.close();
});

function getDiscountTargets(
  rawSessionId: string | undefined,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "GET",
    url: "/discount-targets",
    headers: { ...sessionCookie(rawSessionId), ...headers },
  });
}

async function insertChildCategory(name: string, parentId: string): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name, parentId })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category.id;
}

describe("GET /discount-targets", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getDiscountTargets(undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it.each(OTHER_PERMISSIONS_THAN_PROMOTIONS)(
    "rejects a user who only has %s with 403 forbidden",
    async (...permissionKeys) => {
      const rawSessionId = await signedInWithPermissions(db, NOON, permissionKeys);

      const response = await getDiscountTargets(rawSessionId);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "forbidden" });
    },
  );

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await getDiscountTargets(rawSessionId, {
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("offers nothing when the catalog is empty", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await getDiscountTargets(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ products: [], categories: [], tags: [] });
  });

  it("offers the active products and tags and every category, each by name", async () => {
    const vegano = await insertTag(db, { name: "Vegano" });
    const sinTacc = await insertTag(db, { name: "Sin TACC" });
    await insertTag(db, { name: "Artesanal", active: false });
    const yerba = await insertProductWithTags(db, { name: "Yerba mate", tagIds: [] });
    const almonds = await insertProductWithTags(db, { name: "Almendras", tagIds: [] });
    await insertProductWithTags(db, { name: "Aceite de oliva", tagIds: [], active: false });
    const almacen = await insertCategory(db, "Almacén");
    const jams = await insertChildCategory("Mermeladas", almacen);
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await getDiscountTargets(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [
        { id: almonds.id, name: "Almendras" },
        { id: yerba.id, name: "Yerba mate" },
      ],
      categories: [
        { id: almacen, name: "Almacén", parentId: null },
        { id: expect.any(String), name: "Categoría de Aceite de oliva", parentId: null },
        { id: expect.any(String), name: "Categoría de Almendras", parentId: null },
        { id: expect.any(String), name: "Categoría de Yerba mate", parentId: null },
        { id: jams, name: "Mermeladas", parentId: almacen },
      ],
      tags: [
        { id: sinTacc.id, name: "Sin TACC" },
        { id: vegano.id, name: "Vegano" },
      ],
    });
  });

  it("offers the targets to an Administrator even without the explicit permission", async () => {
    const rawSessionId = await signedInAsAdministrator(db, NOON);

    const response = await getDiscountTargets(rawSessionId);

    expect(response.statusCode).toBe(200);
  });
});

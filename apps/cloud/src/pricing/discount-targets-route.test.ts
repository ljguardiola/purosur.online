import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  insertBrand,
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

  it("offers the active products with their sale unit, the active tags and every category, each by name", async () => {
    const vegano = await insertTag(db, { name: "Vegano" });
    const sinTacc = await insertTag(db, { name: "Sin TACC" });
    await insertTag(db, { name: "Artesanal", active: false });
    const yerba = await insertProductWithTags(db, { name: "Yerba mate", tagIds: [] });
    const almonds = await insertProductWithTags(db, {
      name: "Almendras",
      tagIds: [],
      saleUnit: "KG",
    });
    await insertProductWithTags(db, { name: "Aceite de oliva", tagIds: [], active: false });
    const almacen = await insertCategory(db, "Almacén");
    const jams = await insertChildCategory("Mermeladas", almacen);
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);

    const response = await getDiscountTargets(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [
        {
          id: almonds.id,
          name: "Almendras",
          saleUnit: "KG",
          brandName: null,
          netContent: null,
          barcodes: [],
          benefitKinds: ["PERCENT_OFF"],
        },
        {
          id: yerba.id,
          name: "Yerba mate",
          saleUnit: "UNIT",
          brandName: null,
          netContent: null,
          barcodes: [],
          benefitKinds: ["PERCENT_OFF", "BUY_N_PAY_M"],
        },
      ],
      categories: [
        { id: almacen, name: "Almacén", parentId: null, benefitKinds: ["PERCENT_OFF"] },
        {
          id: expect.any(String),
          name: "Categoría de Aceite de oliva",
          parentId: null,
          benefitKinds: ["PERCENT_OFF"],
        },
        {
          id: expect.any(String),
          name: "Categoría de Almendras",
          parentId: null,
          benefitKinds: ["PERCENT_OFF"],
        },
        {
          id: expect.any(String),
          name: "Categoría de Yerba mate",
          parentId: null,
          benefitKinds: ["PERCENT_OFF"],
        },
        { id: jams, name: "Mermeladas", parentId: almacen, benefitKinds: ["PERCENT_OFF"] },
      ],
      tags: [
        { id: sinTacc.id, name: "Sin TACC", benefitKinds: ["PERCENT_OFF"] },
        { id: vegano.id, name: "Vegano", benefitKinds: ["PERCENT_OFF"] },
      ],
    });
  });

  it("tells each product's brand, net content and active barcodes apart", async () => {
    const playadito = await insertBrand(db, { name: "Playadito" });
    const retired = await insertBrand(db, { name: "Marca retirada", active: false });
    const rawSessionId = await signedInWithPermissions(db, NOON, ["manage_promotions"]);
    const kilo = await insertProductWithTags(db, {
      name: "Yerba mate",
      categoryName: "Yerbas de un kilo",
      tagIds: [],
      brandId: playadito.id,
      netContent: { quantity: 1, unit: "KG" },
      barcodes: [{ code: "7790002" }, { code: "7790001" }, { code: "7790009", active: false }],
    });
    const half = await insertProductWithTags(db, {
      name: "Yerba mate",
      categoryName: "Yerbas de medio kilo",
      tagIds: [],
      brandId: retired.id,
      netContent: { quantity: 0.5, unit: "KG" },
      barcodes: [{ code: "7790003" }],
    });

    const response = await getDiscountTargets(rawSessionId);

    const listed = response.json().products;
    expect(listed).toHaveLength(2);
    expect(listed).toContainEqual({
      id: kilo.id,
      name: "Yerba mate",
      saleUnit: "UNIT",
      brandName: "Playadito",
      netContent: { quantity: 1, unit: "KG" },
      barcodes: ["7790002", "7790001"],
      benefitKinds: ["PERCENT_OFF", "BUY_N_PAY_M"],
    });
    expect(listed).toContainEqual({
      id: half.id,
      name: "Yerba mate",
      saleUnit: "UNIT",
      brandName: "Marca retirada",
      netContent: { quantity: 0.5, unit: "KG" },
      barcodes: ["7790003"],
      benefitKinds: ["PERCENT_OFF", "BUY_N_PAY_M"],
    });
  });

  it("offers the targets to an Administrator even without the explicit permission", async () => {
    const rawSessionId = await signedInAsAdministrator(db, NOON);

    const response = await getDiscountTargets(rawSessionId);

    expect(response.statusCode).toBe(200);
  });
});

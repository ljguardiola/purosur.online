import { ean13Modules } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../access/session-id.js";
import {
  brands,
  categories,
  productBarcodes,
  products,
  productTags,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerProductsListRoute } from "./products-list-route.js";
import { insertTag } from "./test-support/catalog-route-fixtures.js";

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
  registerProductsListRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

async function insertRole(name: string, permissionKeys: string[] = []): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  if (permissionKeys.length > 0) {
    await db
      .insert(rolePermissions)
      .values(permissionKeys.map((permissionKey) => ({ roleId: role.id, permissionKey })));
  }
  return role.id;
}

async function insertUser(input: {
  firstName: string;
  email: string;
  roleId: string;
  locationId: string;
}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: input.firstName, email: input.email, locationId: input.locationId })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
}

async function insertSession(userId: string): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
  });
  return rawSessionId;
}

async function insertUserWithPermission(
  permissionKeys: string[] = ["manage_products_and_categories"],
): Promise<string> {
  const roleId = await insertRole("Encargada", permissionKeys);
  return insertUser({
    firstName: "Ada Lovelace",
    email: "ada@example.com",
    roleId,
    locationId: await seededLocationId(db),
  });
}

async function insertCategory(name: string): Promise<string> {
  const [category] = await db.insert(categories).values({ name }).returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  return category.id;
}

async function insertProduct(input: {
  name: string;
  categoryId: string;
  saleUnit: "UNIT" | "KG";
  barcodes: string[];
}): Promise<{ id: string; version: number }> {
  const [product] = await db
    .insert(products)
    .values({ name: input.name, categoryId: input.categoryId, saleUnit: input.saleUnit })
    .returning({ id: products.id, version: products.version });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  await db
    .insert(productBarcodes)
    .values(input.barcodes.map((code, position) => ({ productId: product.id, code, position })));
  return product;
}

function getProducts(
  rawSessionId?: string,
  headers: Record<string, string> = {},
  query: Record<string, string> = {},
) {
  const search = new URLSearchParams(query).toString();
  return app.inject({
    method: "GET",
    url: search ? `/products?${search}` : "/products",
    headers: {
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      ...headers,
    },
  });
}

describe("GET /products", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getProducts();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a user without the products and categories permission with 403 forbidden", async () => {
    const userId = await insertUserWithPermission(["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("rejects a user who only has the promotions permission with 403 forbidden", async () => {
    const userId = await insertUserWithPermission(["manage_promotions"]);
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("lists products by name with their category and barcodes in insertion order", async () => {
    const macetasId = await insertCategory("Macetas");
    const semillasId = await insertCategory("Semillas");
    const maceta = await insertProduct({
      name: "Maceta 20cm",
      categoryId: macetasId,
      saleUnit: "UNIT",
      barcodes: ["222", "111"],
    });
    const semilla = await insertProduct({
      name: "Alpiste 1kg",
      categoryId: semillasId,
      saleUnit: "KG",
      barcodes: ["333"],
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: semilla.id,
        name: "Alpiste 1kg",
        categoryId: semillasId,
        categoryName: "Semillas",
        brandId: null,
        saleUnit: "KG",
        barcodes: ["333"],
        tagIds: [],
        netContent: null,
        active: true,
        labelCode: null,
        labelModules: null,
        version: semilla.version,
      },
      {
        id: maceta.id,
        name: "Maceta 20cm",
        categoryId: macetasId,
        categoryName: "Macetas",
        brandId: null,
        saleUnit: "UNIT",
        barcodes: ["222", "111"],
        tagIds: [],
        netContent: null,
        active: true,
        labelCode: null,
        labelModules: null,
        version: maceta.version,
      },
    ]);
  });

  it("gives each product the internal barcode its label carries, none when it is inactive", async () => {
    const categoryId = await insertCategory("Macetas");
    const labeled = await insertProduct({
      name: "Maceta con etiqueta",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["7790001000011", "2000000000015"],
    });
    const inactive = await insertProduct({
      name: "Maceta inactiva",
      categoryId,
      saleUnit: "UNIT",
      barcodes: ["2000000000022"],
    });
    await db.update(products).set({ active: false }).where(eq(products.id, inactive.id));
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId, {}, { status: "all" });

    const labels = new Map(
      response
        .json()
        .map((product: { id: string; labelCode: unknown; labelModules: unknown }) => [
          product.id,
          { labelCode: product.labelCode, labelModules: product.labelModules },
        ]),
    );
    expect(labels).toEqual(
      new Map([
        [labeled.id, { labelCode: "2000000000015", labelModules: ean13Modules("2000000000015") }],
        [inactive.id, { labelCode: null, labelModules: null }],
      ]),
    );
  });

  it("returns the brand of a product that has one, deactivated or not", async () => {
    const categoryId = await insertCategory("Almacén");
    const [brand] = await db
      .insert(brands)
      .values({ name: "Yerba del Litoral", active: false })
      .returning({ id: brands.id });
    if (!brand) {
      throw new Error("test setup: seeding the brand returned no row");
    }
    await db
      .insert(products)
      .values({ name: "Miel pura de abeja", categoryId, saleUnit: "UNIT", brandId: brand.id });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId);

    expect(response.json()).toMatchObject([{ brandId: brand.id }]);
  });

  it("returns the tags of each product, deactivated ones included, in tag name order", async () => {
    const categoryId = await insertCategory("Almacén");
    const veganoId = (await insertTag(db, { name: "Vegano" })).id;
    const sinTaccId = (await insertTag(db, { name: "Sin TACC" })).id;
    const kosherId = (await insertTag(db, { name: "Kosher", active: false })).id;
    const [tagged, bare] = await db
      .insert(products)
      .values([
        { name: "Galletitas", categoryId, saleUnit: "UNIT" },
        { name: "Dátiles", categoryId, saleUnit: "KG" },
      ])
      .returning({ id: products.id });
    if (!tagged || !bare) {
      throw new Error("test setup: seeding the products returned no row");
    }
    await db.insert(productTags).values([
      { productId: tagged.id, tagId: veganoId },
      { productId: tagged.id, tagId: kosherId },
      { productId: tagged.id, tagId: sinTaccId },
    ]);
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId);

    const byId = new Map(
      (response.json() as { id: string; tagIds: string[] }[]).map((row) => [row.id, row.tagIds]),
    );
    expect(byId.get(tagged.id)).toEqual([kosherId, sinTaccId, veganoId]);
    expect(byId.get(bare.id)).toEqual([]);
  });

  it("returns the net content of a product that has one", async () => {
    const categoryId = await insertCategory("Semillas");
    await db.insert(products).values({
      name: "Alpiste 1kg",
      categoryId,
      saleUnit: "KG",
      netContentQuantity: 1,
      netContentUnit: "KG",
    });
    const userId = await insertUserWithPermission();
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId);

    expect(response.json()).toMatchObject([{ netContent: { quantity: 1, unit: "KG" } }]);
  });

  describe("the status filter", () => {
    async function seedActiveAndInactive(): Promise<{ activeId: string; inactiveId: string }> {
      const categoryId = await insertCategory("Macetas");
      const active = await insertProduct({
        name: "Maceta activa",
        categoryId,
        saleUnit: "UNIT",
        barcodes: ["1"],
      });
      const inactive = await insertProduct({
        name: "Maceta inactiva",
        categoryId,
        saleUnit: "UNIT",
        barcodes: ["2"],
      });
      await db.update(products).set({ active: false }).where(eq(products.id, inactive.id));
      return { activeId: active.id, inactiveId: inactive.id };
    }

    it("defaults to active products only, omitting inactive ones", async () => {
      const { activeId, inactiveId } = await seedActiveAndInactive();
      const userId = await insertUserWithPermission();
      const rawSessionId = await insertSession(userId);

      const response = await getProducts(rawSessionId);

      const ids = (response.json() as { id: string }[]).map((row) => row.id);
      expect(ids).toEqual([activeId]);
      expect(ids).not.toContain(inactiveId);
    });

    it("lists only inactive products with status=inactive", async () => {
      const { activeId, inactiveId } = await seedActiveAndInactive();
      const userId = await insertUserWithPermission();
      const rawSessionId = await insertSession(userId);

      const response = await getProducts(rawSessionId, {}, { status: "inactive" });

      const ids = (response.json() as { id: string }[]).map((row) => row.id);
      expect(ids).toEqual([inactiveId]);
      expect(ids).not.toContain(activeId);
    });

    it("lists both active and inactive products with status=all", async () => {
      const { activeId, inactiveId } = await seedActiveAndInactive();
      const userId = await insertUserWithPermission();
      const rawSessionId = await insertSession(userId);

      const response = await getProducts(rawSessionId, {}, { status: "all" });

      const ids = (response.json() as { id: string }[]).map((row) => row.id).sort();
      expect(ids).toEqual([activeId, inactiveId].sort());
    });

    it("rejects an unrecognized status value", async () => {
      const userId = await insertUserWithPermission();
      const rawSessionId = await insertSession(userId);

      const response = await getProducts(rawSessionId, {}, { status: "bogus" });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation_failed" });
    });

    it.each(["constructor", "__proto__", "toString"])(
      "rejects the inherited object member %s as a status value",
      async (status) => {
        const userId = await insertUserWithPermission();
        const rawSessionId = await insertSession(userId);

        const response = await getProducts(rawSessionId, {}, { status });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({
          code: "validation_failed",
          message: "status must be one of active, inactive, or all",
          details: [{ field: "status" }],
        });
      },
    );
  });

  it("lists products for an Administrator even without the explicit permission", async () => {
    const categoryId = await insertCategory("Semillas");
    await insertProduct({ name: "Alpiste", categoryId, saleUnit: "KG", barcodes: ["1"] });
    const [administratorRole] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.isAdministrator, true));
    if (!administratorRole) {
      throw new Error("test setup: no Administrator role seeded");
    }
    const userId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: administratorRole.id,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(userId);

    const response = await getProducts(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ name: "Alpiste" }]);
  });
});

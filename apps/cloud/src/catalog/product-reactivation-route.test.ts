import { changesPageSchema } from "@purosur/contracts";
import { createProduct, deactivateProduct } from "@purosur/domain/catalog/use-cases";
import { asc, eq, max } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { categories, changes, productBarcodes, products } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { registerRouteAccess } from "../sessions/route-access.js";
import { registerChangesRoute } from "../sync/changes-route.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import { DrizzleCatalogStore } from "./drizzle-catalog-store.js";
import { registerProductReactivationRoute } from "./product-reactivation-route.js";
import {
  sessionCookie,
  signedInAsAdministrator,
  signedInWithPermissions,
} from "./test-support/catalog-route-fixtures.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

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
  registerRouteAccess(app);
  registerProductReactivationRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
  registerChangesRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    now: () => NOON,
  });
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
    method: "DELETE",
    url: `/products/${id}/deactivation`,
    headers: { origin: BACKOFFICE_ORIGIN, ...sessionCookie(rawSessionId), ...headers },
    payload: {},
  });
}

async function newProduct(name: string, barcodes: string[]): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Macetas ${name}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const outcome = await createProduct(new DrizzleCatalogStore(db), {
    name,
    categoryId: category.id,
    brandId: null,
    saleUnit: "UNIT",
    barcodes,
    tagIds: [],
    netContent: null,
  });
  if (outcome.kind !== "created") {
    throw new Error(`test setup: creating the product ended as ${outcome.kind}`);
  }
  return outcome.product.id;
}

async function newDeactivatedProduct(name: string, barcodes: string[]): Promise<string> {
  const id = await newProduct(name, barcodes);
  await deactivateProduct(new DrizzleCatalogStore(db), id);
  return id;
}

async function storedProduct(id: string) {
  const [product] = await db
    .select({ active: products.active, version: products.version })
    .from(products)
    .where(eq(products.id, id));
  return product;
}

async function storedBarcodes(productId: string) {
  return db
    .select({ code: productBarcodes.code, active: productBarcodes.active })
    .from(productBarcodes)
    .where(eq(productBarcodes.productId, productId))
    .orderBy(asc(productBarcodes.position));
}

describe("DELETE /products/:id/deactivation", () => {
  it("returns 401 unauthenticated when no cookie was sent, changing nothing", async () => {
    const id = await newDeactivatedProduct("Maceta", ["111"]);

    const response = await request(undefined, id);

    expect(response.statusCode).toBe(401);
    expect(await storedProduct(id)).toEqual({ active: false, version: 2 });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const id = await newDeactivatedProduct("Maceta", ["111"]);
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, id, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await storedProduct(id)).toEqual({ active: false, version: 2 });
  });

  it("rejects a user without the products and categories permission with 403 forbidden, changing nothing", async () => {
    const id = await newDeactivatedProduct("Maceta", ["111"]);
    const rawSessionId = await signedInWithPermissions(db, NOON, ["sell_and_charge"]);

    const response = await request(rawSessionId, id);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await storedProduct(id)).toEqual({ active: false, version: 2 });
  });

  it("reactivates the product for an Administrator even without the explicit permission", async () => {
    const id = await newDeactivatedProduct("Maceta", ["111"]);
    const rawSessionId = await signedInAsAdministrator(db, NOON);

    const response = await request(rawSessionId, id);

    expect(response.statusCode).toBe(200);
  });

  it("reactivates the product, bumping its version and making its barcodes active", async () => {
    const id = await newDeactivatedProduct("Maceta", ["111", "222"]);
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, id);

    expect(response.statusCode).toBe(200);
    expect(await storedProduct(id)).toEqual({ active: true, version: 3 });
    expect(await storedBarcodes(id)).toEqual([
      { code: "111", active: true },
      { code: "222", active: true },
    ]);
  });

  it("hands the registers the reactivated product as active in what they pull", async () => {
    const { deviceToken } = await insertEnrolledInstallation(db, { now: NOON });
    const id = await newDeactivatedProduct("Maceta", ["111"]);
    const [logged] = await db.select({ lastSeq: max(changes.changeSeq) }).from(changes);
    const rawSessionId = await signedInWithPermissions(db, NOON);

    await request(rawSessionId, id);

    const pulled = await app.inject({
      method: "GET",
      url: `/changes?since=${logged?.lastSeq ?? 0}`,
      headers: { authorization: `Bearer ${deviceToken}` },
    });
    const page = changesPageSchema.parse(pulled.json());
    expect(page.changes).toHaveLength(1);
    expect(page.changes[0]).toMatchObject({
      entity: "product",
      entity_id: id,
      row: { active: true, version: 3, barcodes: [{ position: 0, code: "111" }] },
    });
  });

  it("returns 409 product_already_active for an active product, changing nothing", async () => {
    const id = await newProduct("Maceta", ["111"]);
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "product_already_active" });
    expect(await storedProduct(id)).toEqual({ active: true, version: 1 });
  });

  it("returns 409 barcode_taken naming the codes an active product holds, changing nothing", async () => {
    const id = await newDeactivatedProduct("Maceta", ["111", "222"]);
    await newProduct("Otra maceta", ["222"]);
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, id);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: "barcode_taken", codes: ["222"] });
    expect(await storedProduct(id)).toEqual({ active: false, version: 2 });
    expect(await storedBarcodes(id)).toEqual([
      { code: "111", active: false },
      { code: "222", active: false },
    ]);
  });

  it("answers 400 validation_failed naming id for a malformed id, changing nothing", async () => {
    const id = await newDeactivatedProduct("Maceta", ["111"]);
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, "not-a-uuid");

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "id" }],
    });
    expect(await storedProduct(id)).toEqual({ active: false, version: 2 });
  });

  it("returns 404 not_found for an id no product has", async () => {
    const rawSessionId = await signedInWithPermissions(db, NOON);

    const response = await request(rawSessionId, MISSING_ID);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: "not_found", message: "no product with that id" });
  });
});

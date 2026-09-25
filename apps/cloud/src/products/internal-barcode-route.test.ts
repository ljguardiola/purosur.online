import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  categories,
  productBarcodes,
  products,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { appendEan13CheckDigit } from "./ean13-check-digit.js";
import { allocateInternalBarcode, registerInternalBarcodeRoute } from "./internal-barcode-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const EAN13_RESTRICTED_CIRCULATION_PATTERN = /^2[0-9]\d{11}$/;

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function nextSequenceValue(): Promise<bigint> {
  const [row] = (
    await testDatabase.client.query<{ last_value: string }>(
      "select last_value from internal_barcode_sequence",
    )
  ).rows;
  if (!row) {
    throw new Error("test setup: reading the sequence's last_value returned no row");
  }
  return BigInt(row.last_value) + 1n;
}

async function insertBarcodeForNewProduct(code: string): Promise<void> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Macetas ${code}` })
    .returning({ id: categories.id });
  if (!category) {
    throw new Error("test setup: seeding the category returned no row");
  }
  const [product] = await db
    .insert(products)
    .values({ name: "Existing", categoryId: category.id, saleUnit: "UNIT" })
    .returning({ id: products.id });
  if (!product) {
    throw new Error("test setup: seeding the product returned no row");
  }
  await db.insert(productBarcodes).values({ productId: product.id, code, position: 0 });
}

describe("allocateInternalBarcode", () => {
  it("allocates a GS1 restricted-circulation (20-29) EAN-13 code with a valid check digit", async () => {
    const code = await allocateInternalBarcode(db);

    expect(code).toMatch(EAN13_RESTRICTED_CIRCULATION_PATTERN);
    expect(code).toBe(appendEan13CheckDigit(code.slice(0, 12)));
  });

  it("returns a different code on consecutive allocations", async () => {
    const first = await allocateInternalBarcode(db);
    const second = await allocateInternalBarcode(db);

    expect(second).not.toBe(first);
  });

  it("skips a code already used by a product barcode", async () => {
    const takenValue = await nextSequenceValue();
    const takenCode = appendEan13CheckDigit(takenValue.toString());
    await insertBarcodeForNewProduct(takenCode);

    const code = await allocateInternalBarcode(db);

    expect(code).not.toBe(takenCode);
    expect(code).toBe(appendEan13CheckDigit((takenValue + 1n).toString()));
  });
});

describe("POST /products/internal-barcode", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = Fastify();
    registerInternalBarcodeRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

  async function insertUser(roleId: string): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({
        firstName: "Ada Lovelace",
        email: "ada@example.com",
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId });
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

  function cookieHeader(rawSessionId: string): Record<string, string> {
    return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
  }

  function requestInternalBarcode(
    rawSessionId: string | undefined,
    headers: Record<string, string> = {},
  ) {
    return app.inject({
      method: "POST",
      url: "/products/internal-barcode",
      headers: {
        origin: BACKOFFICE_ORIGIN,
        ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
        ...headers,
      },
    });
  }

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await requestInternalBarcode(undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const roleId = await insertRole("Encargada", ["manage_products_and_categories"]);
    const userId = await insertUser(roleId);
    const rawSessionId = await insertSession(userId);

    const response = await requestInternalBarcode(rawSessionId, {
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without the products and categories permission", async () => {
    const roleId = await insertRole("Cajera", ["sell_and_charge"]);
    const userId = await insertUser(roleId);
    const rawSessionId = await insertSession(userId);

    const response = await requestInternalBarcode(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("returns the allocated code for a user holding the products and categories permission", async () => {
    const roleId = await insertRole("Encargada", ["manage_products_and_categories"]);
    const userId = await insertUser(roleId);
    const rawSessionId = await insertSession(userId);

    const response = await requestInternalBarcode(rawSessionId);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.code).toMatch(EAN13_RESTRICTED_CIRCULATION_PATTERN);
  });
});

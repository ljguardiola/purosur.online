import { appendEan13CheckDigit } from "@purosur/domain";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "../access/session-cookie.js";
import { generateSessionId, hashSessionId } from "../access/session-id.js";
import { rolePermissions, roles, sessions, userRoles, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerInternalBarcodeRoute } from "./internal-barcode-route.js";

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

describe("POST /internal-barcodes", () => {
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
    payload: Record<string, unknown> = { barcodes: [] },
  ) {
    return app.inject({
      method: "POST",
      url: "/internal-barcodes",
      headers: {
        origin: BACKOFFICE_ORIGIN,
        ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
        ...headers,
      },
      payload,
    });
  }

  function nextInternalBarcode(code: string): string {
    return appendEan13CheckDigit((BigInt(code.slice(0, 12)) + 1n).toString());
  }

  it("no longer answers the old internal barcode path", async () => {
    const roleId = await insertRole("Encargada", ["manage_products_and_categories"]);
    const userId = await insertUser(roleId);
    const rawSessionId = await insertSession(userId);

    const response = await app.inject({
      method: "POST",
      url: "/products/internal-barcode",
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(404);
  });

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

  it("refuses generating for a product that already has a barcode with 400 validation_failed, drawing nothing from the internal sequence", async () => {
    const roleId = await insertRole("Encargada", ["manage_products_and_categories"]);
    const userId = await insertUser(roleId);
    const rawSessionId = await insertSession(userId);
    const before = (await requestInternalBarcode(rawSessionId)).json().code;

    const refused = await requestInternalBarcode(rawSessionId, {}, { barcodes: ["7790987000015"] });

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toEqual({
      code: "validation_failed",
      message: "an internal barcode is only generated for a product with no barcode",
      details: [{ field: "barcodes" }],
    });
    const after = (await requestInternalBarcode(rawSessionId)).json().code;
    expect(after).toBe(nextInternalBarcode(before));
  });
});

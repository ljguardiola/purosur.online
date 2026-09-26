import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  locations,
  registers,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRegisterCreationRoute } from "./register-creation-route.js";

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
  registerRegisterCreationRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
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

/** Inserts a session, authorized (by default, at NOON) unless `authorizedAt` is passed as `null`. */
async function insertSession(userId: string, authorizedAt: Date | null = NOON): Promise<string> {
  const rawSessionId = generateSessionId();
  await db.insert(sessions).values({
    userId,
    sessionIdHash: hashSessionId(rawSessionId),
    createdAt: NOON,
    lastSeenAt: NOON,
    passkeyAuthorizedAt: authorizedAt,
  });
  return rawSessionId;
}

async function insertUserWithPermission(
  locationId: string,
  permissionKeys: string[] = ["enroll_register_devices"],
): Promise<string> {
  const roleId = await insertRole("Encargada", permissionKeys);
  return insertUser({ firstName: "Ada Lovelace", email: "ada@example.com", roleId, locationId });
}

async function insertOtherLocation(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  return location.id;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function createRegister(
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: "/registers",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
    payload: body,
  });
}

describe("POST /registers", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await createRegister(undefined, { name: "Caja 1" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, creating nothing", async () => {
    const locationId = await seededLocationId(db);
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await createRegister(
      rawSessionId,
      { name: "Caja 1" },
      { origin: "https://attacker.example" },
    );

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(registers)).toHaveLength(0);
  });

  it("rejects a user without the enroll_register_devices permission with 403 forbidden, creating nothing", async () => {
    const locationId = await seededLocationId(db);
    const userId = await insertUserWithPermission(locationId, ["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await createRegister(rawSessionId, { name: "Caja 1" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(registers)).toHaveLength(0);
  });

  it("returns 401 authorization_required and creates nothing when the session was never passkey-authorized", async () => {
    const locationId = await seededLocationId(db);
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId, null);

    const response = await createRegister(rawSessionId, { name: "Caja 1" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await db.select().from(registers)).toHaveLength(0);
    expect(await db.select().from(auditLog)).toHaveLength(0);
  });

  it("checks validation before passkey authorization, the same order role-creation-route.ts uses", async () => {
    const locationId = await seededLocationId(db);
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId, null);

    const response = await createRegister(rawSessionId, { name: "   " });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("creates the register in the session's own branch, trimming its name", async () => {
    const locationId = await seededLocationId(db);
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await createRegister(rawSessionId, { name: "  Caja 1  " });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({ id: body.id, name: "Caja 1" });
    const created = await db.select().from(registers).where(eq(registers.id, body.id));
    expect(created).toMatchObject([{ name: "Caja 1", locationId }]);
  });

  it("audits the actor and the created register, in the same transaction", async () => {
    const locationId = await seededLocationId(db);
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await createRegister(rawSessionId, { name: "Caja 1" });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, body.id));
    expect(entry).toMatchObject({
      entity: "register",
      entityId: body.id,
      actorId: userId,
      previousValue: null,
      newValue: { name: "Caja 1", location_id: locationId },
    });
  });

  it("rejects a name already taken in the same branch, case-insensitively, creating nothing", async () => {
    const locationId = await seededLocationId(db);
    await db.insert(registers).values({ locationId, name: "Caja 1" });
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await createRegister(rawSessionId, { name: "CAJA 1" });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "register_name_taken" });
    expect(await db.select().from(registers)).toHaveLength(1);
  });

  it("allows the same name in a different branch", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertOtherLocation();
    await db.insert(registers).values({ locationId: otherLocationId, name: "Caja 1" });
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await createRegister(rawSessionId, { name: "Caja 1" });

    expect(response.statusCode).toBe(201);
    expect(await db.select().from(registers)).toHaveLength(2);
  });

  it("creates the register for an Administrator even without the explicit permission", async () => {
    const locationId = await seededLocationId(db);
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
      locationId,
    });
    const rawSessionId = await insertSession(userId);

    const response = await createRegister(rawSessionId, { name: "Caja 1" });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: "Caja 1" });
  });
});

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  locations,
  registerEnrollmentCodes,
  registers,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../db/schema.js";
import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "../session/passkey-authorization-guard.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRegisterEnrollmentCodeRoute } from "./register-enrollment-code-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const REGISTER_ENROLLMENT_CODE_WINDOW_MS = 15 * 60 * 1000;

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
  registerRegisterEnrollmentCodeRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
  });
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

async function insertRegister(locationId: string, name: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function emitCode(
  registerId: string,
  rawSessionId: string | undefined,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/registers/${registerId}/enrollment-code`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
  });
}

describe("POST /registers/:id/enrollment-code", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");

    const response = await emitCode(registerId, undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own, changing nothing", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await emitCode(registerId, rawSessionId, {
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    expect(await db.select().from(registerEnrollmentCodes)).toHaveLength(0);
  });

  it("rejects a user without the enroll_register_devices permission with 403 forbidden, changing nothing", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const userId = await insertUserWithPermission(locationId, ["sell_and_charge"]);
    const rawSessionId = await insertSession(userId);

    const response = await emitCode(registerId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    expect(await db.select().from(registerEnrollmentCodes)).toHaveLength(0);
  });

  it("returns 404 not_found for a malformed id, changing nothing", async () => {
    const locationId = await seededLocationId(db);
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await emitCode("not-a-uuid", rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("returns 404 not_found for a register that doesn't exist, changing nothing", async () => {
    const locationId = await seededLocationId(db);
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await emitCode("00000000-0000-0000-0000-000000000000", rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("returns 404 not_found for another branch's register, changing nothing", async () => {
    const locationId = await seededLocationId(db);
    const otherLocationId = await insertOtherLocation();
    const otherRegisterId = await insertRegister(otherLocationId, "Caja de la otra sucursal");
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await emitCode(otherRegisterId, rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    expect(await db.select().from(registerEnrollmentCodes)).toHaveLength(0);
  });

  it("checks the register exists before passkey authorization", async () => {
    const locationId = await seededLocationId(db);
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId, null);

    const response = await emitCode("00000000-0000-0000-0000-000000000000", rawSessionId);

    expect(response.statusCode).toBe(404);
  });

  it("returns 401 authorization_required and changes nothing when the session was never passkey-authorized", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId, null);

    const response = await emitCode(registerId, rawSessionId);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "authorization_required" });
    expect(await db.select().from(registerEnrollmentCodes)).toHaveLength(0);
  });

  it("allows emission at exactly the 5-minute passkey authorization boundary", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const userId = await insertUserWithPermission(locationId);
    const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS);
    const rawSessionId = await insertSession(userId, authorizedAt);

    const response = await emitCode(registerId, rawSessionId);

    expect(response.statusCode).toBe(200);
  });

  it("returns a 16-character base32 code and its expires_at, 15 minutes from now", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await emitCode(registerId, rawSessionId);

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.code).toMatch(/^[A-Z2-7]{16}$/);
    expect(body.expires_at).toBe(
      new Date(NOON.getTime() + REGISTER_ENROLLMENT_CODE_WINDOW_MS).toISOString(),
    );
  });

  it("stores only the SHA-256 hash of the code, never the code itself", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await emitCode(registerId, rawSessionId);

    const body = response.json();
    const [stored] = await db
      .select()
      .from(registerEnrollmentCodes)
      .where(eq(registerEnrollmentCodes.registerId, registerId));
    expect(stored?.codeHash).not.toBe(body.code);
    expect(stored?.codeHash).toBe(createHash("sha256").update(body.code).digest("base64url"));
    expect(stored).toMatchObject({
      redeemedAt: null,
      failedAttempts: 0,
      issuedAt: NOON,
      expiresAt: new Date(NOON.getTime() + REGISTER_ENROLLMENT_CODE_WINDOW_MS),
    });
  });

  it("audits the actor and the register, without the code or its hash", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);

    const response = await emitCode(registerId, rawSessionId);

    expect(response.statusCode).toBe(200);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, registerId));
    expect(entry).toMatchObject({
      entity: "register_enrollment_code",
      entityId: registerId,
      actorId: userId,
      newValue: {
        expires_at: new Date(NOON.getTime() + REGISTER_ENROLLMENT_CODE_WINDOW_MS).toISOString(),
      },
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(response.json().code);
  });

  it("replaces a previous pending code when re-emitted, keeping exactly one row", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
    const userId = await insertUserWithPermission(locationId);
    const rawSessionId = await insertSession(userId);
    const first = await emitCode(registerId, rawSessionId);
    expect(first.statusCode).toBe(200);
    const firstCode = first.json().code;

    const second = await emitCode(registerId, rawSessionId);

    expect(second.statusCode).toBe(200);
    const secondCode = second.json().code;
    expect(secondCode).not.toBe(firstCode);
    const rows = await db
      .select()
      .from(registerEnrollmentCodes)
      .where(eq(registerEnrollmentCodes.registerId, registerId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.codeHash).toBe(createHash("sha256").update(secondCode).digest("base64url"));
  });

  it("allows emission for an Administrator even without the explicit permission", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");
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

    const response = await emitCode(registerId, rawSessionId);

    expect(response.statusCode).toBe(200);
  });
});

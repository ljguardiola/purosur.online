import { PERMISSION_CATALOG } from "@purosur/domain";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  locations,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { SESSION_COOKIE_NAME } from "../sessions/session-cookie.js";
import { generateSessionId, hashSessionId } from "../sessions/session-id.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRegisterCoverageRoute } from "./register-coverage-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

const REGISTER_PERMISSION_KEYS = PERMISSION_CATALOG.filter(
  (definition) => definition.registerMarker !== "none",
).map((definition) => definition.key);

const EVERY_REGISTER_PERMISSION_BUT_VOID_AND_CLOCK = REGISTER_PERMISSION_KEYS.filter(
  (key) => key !== "void_sale" && key !== "correct_register_clock",
);

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let emailSequence = 0;

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
  registerRegisterCoverageRoute(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => NOON });
});

afterEach(async () => {
  await app.close();
});

async function insertRole(name: string, permissionKeys: readonly string[]): Promise<string> {
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

async function administratorRoleId(): Promise<string> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return administratorRole.id;
}

async function insertUser(input: {
  roleId: string;
  locationId: string;
  active?: boolean;
}): Promise<string> {
  emailSequence += 1;
  const [user] = await db
    .insert(users)
    .values({
      firstName: "Ada",
      email: `user-${emailSequence}@example.com`,
      locationId: input.locationId,
      active: input.active ?? true,
    })
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

async function administratorSession(locationId: string): Promise<string> {
  const userId = await insertUser({ roleId: await administratorRoleId(), locationId });
  return insertSession(userId);
}

async function insertOtherLocation(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  return location.id;
}

function getCoverage(rawSessionId?: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: "GET",
    url: "/registers/coverage",
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` } : {}),
      ...headers,
    },
  });
}

describe("GET /registers/coverage", () => {
  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await getCoverage();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await administratorSession(await seededLocationId(db));

    const response = await getCoverage(rawSessionId, { origin: "https://attacker.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a user without the enroll_register_devices permission with 403 forbidden", async () => {
    const locationId = await seededLocationId(db);
    const roleId = await insertRole("Cajera", ["sell_and_charge"]);
    const rawSessionId = await insertSession(await insertUser({ roleId, locationId }));

    const response = await getCoverage(rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
  });

  it("lists the register permissions no active user of the branch holds through their role", async () => {
    const locationId = await seededLocationId(db);
    const roleId = await insertRole("Encargada", EVERY_REGISTER_PERMISSION_BUT_VOID_AND_CLOCK);
    await insertUser({ roleId, locationId });
    const rawSessionId = await administratorSession(locationId);

    const response = await getCoverage(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      uncovered_permissions: ["void_sale", "correct_register_clock"],
    });
  });

  it("lists nothing once an active user of the branch holds every register permission", async () => {
    const locationId = await seededLocationId(db);
    const roleId = await insertRole("Encargada", REGISTER_PERMISSION_KEYS);
    await insertUser({ roleId, locationId });
    const rawSessionId = await administratorSession(locationId);

    const response = await getCoverage(rawSessionId);

    expect(response.json()).toEqual({ uncovered_permissions: [] });
  });

  it("does not count a permission held only by an inactive user", async () => {
    const locationId = await seededLocationId(db);
    const roleId = await insertRole("Encargada", REGISTER_PERMISSION_KEYS);
    await insertUser({ roleId, locationId, active: false });
    const rawSessionId = await administratorSession(locationId);

    const response = await getCoverage(rawSessionId);

    expect(response.json()).toEqual({ uncovered_permissions: REGISTER_PERMISSION_KEYS });
  });

  it("does not count a permission held only by a user of another branch", async () => {
    const locationId = await seededLocationId(db);
    const roleId = await insertRole("Encargada", REGISTER_PERMISSION_KEYS);
    await insertUser({ roleId, locationId: await insertOtherLocation() });
    const rawSessionId = await administratorSession(locationId);

    const response = await getCoverage(rawSessionId);

    expect(response.json()).toEqual({ uncovered_permissions: REGISTER_PERMISSION_KEYS });
  });

  it("does not count an active Administrator as holding a register permission their role does not list", async () => {
    const locationId = await seededLocationId(db);
    const rawSessionId = await administratorSession(locationId);

    const response = await getCoverage(rawSessionId);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ uncovered_permissions: REGISTER_PERMISSION_KEYS });
  });
});

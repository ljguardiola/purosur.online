import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import {
  auditLog,
  locations,
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
import { registerRoleEditRoutes } from "./role-edit-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let administratorId: string;
let currentTime: Date;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

async function seededAdministratorRoleId(): Promise<string> {
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return administratorRole.id;
}

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

async function insertSession(userId: string, authorizedAt: Date = NOON): Promise<string> {
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

function cookieHeader(rawSessionId: string): Record<string, string> {
  return { cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}` };
}

function postJson(
  target: FastifyInstance,
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return target.inject({
    method: "POST",
    url,
    headers: { origin: BACKOFFICE_ORIGIN, ...headers },
    payload: body,
  });
}

function editRoleRequest(
  roleId: string,
  rawSessionId: string | undefined,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return postJson(
    app,
    `/roles/${roleId}/edit`,
    body,
    rawSessionId ? { ...cookieHeader(rawSessionId), ...headers } : headers,
  );
}

beforeEach(async () => {
  await testDatabase.clear();

  const locationId = await seededLocationId(db);
  administratorId = await insertUser({
    firstName: "Ada Lovelace",
    email: "ada@example.com",
    roleId: await seededAdministratorRoleId(),
    locationId,
  });

  currentTime = NOON;
  app = Fastify();
  registerRoleEditRoutes(app, { db, backofficeOrigin: BACKOFFICE_ORIGIN, now: () => currentTime });
});

afterEach(async () => {
  await app.close();
});

describe("POST /roles/:id/edit", () => {
  let roleId: string;

  beforeEach(async () => {
    roleId = await insertRole("Cajera", ["sell_and_charge"]);
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await editRoleRequest(roleId, undefined, {
      name: "Cajera",
      permissions: ["sell_and_charge"],
      version: 1,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: `/roles/${roleId}/edit`,
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden, changing nothing", async () => {
    const cashierRoleId = await insertRole("Vendedora");
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const nonAdminSession = await insertSession(cashierId);

    const response = await editRoleRequest(roleId, nonAdminSession, {
      name: "Cajera nueva",
      permissions: [],
      version: 1,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
  });

  it("answers the identical 404 for the Administrator role, a missing id, and a malformed one, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const body = { name: "Nuevo nombre", permissions: [], version: 1 };

    const administratorResponse = await editRoleRequest(
      await seededAdministratorRoleId(),
      rawSessionId,
      body,
    );
    const missingResponse = await editRoleRequest(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
      body,
    );
    const malformedResponse = await editRoleRequest("not-a-uuid", rawSessionId, body);

    expect(administratorResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(administratorResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(malformedResponse.json());
  });

  it("rejects an empty name, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "   ",
      permissions: [],
      version: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
  });

  it("rejects an unknown permission key, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera",
      permissions: ["not_a_real_permission"],
      version: 1,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "permissions" }],
    });
  });

  it("rejects a missing or non-positive version, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera",
      permissions: [],
      version: 0,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "version" }],
    });
  });

  it("returns 409 stale_version and changes nothing when the sent version does not match", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera nueva",
      permissions: [],
      version: 2,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "stale_version" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, roleId));
    expect(audited).toHaveLength(0);
  });

  it("returns 409 role_name_taken and changes nothing when another role already has that name", async () => {
    await insertRole("Depósito");
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "DEPÓSITO",
      permissions: [],
      version: 1,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "role_name_taken" });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
  });

  it("allows renaming a role to its own name in another case", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "CAJERA",
      permissions: ["sell_and_charge"],
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "CAJERA", version: 2 });
  });

  it("accepts an unchanged name and permission set as a no-op: 200, version unchanged, no audit row", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera",
      permissions: ["sell_and_charge"],
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: roleId, name: "Cajera", version: 1 });
    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera", version: 1 });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, roleId));
    expect(audited).toHaveLength(0);
  });

  it("updates the name, replaces the permissions, bumps the version, audits actor/previous/new, and returns 200", async () => {
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);
    const graceId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId,
      locationId,
    });

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera senior",
      permissions: ["sell_and_charge", "adjust_stock"],
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: roleId,
      name: "Cajera senior",
      is_administrator: false,
      permissions: ["sell_and_charge", "adjust_stock"],
      user_count: 1,
      version: 2,
      assigned_users: [{ id: graceId, name: "Grace Hopper" }],
    });

    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ name: "Cajera senior", version: 2 });
    const storedPermissions = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    expect(storedPermissions.map((r) => r.permissionKey).sort()).toEqual(
      ["adjust_stock", "sell_and_charge"].sort(),
    );

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "role"));
    const editAudit = audited.find((row) => row.entityId === roleId);
    expect(editAudit).toMatchObject({
      actorId: administratorId,
      previousValue: { name: "Cajera", permissions: ["sell_and_charge"] },
      newValue: { name: "Cajera senior", permissions: ["sell_and_charge", "adjust_stock"] },
    });
  });

  it("lists and counts a person holding the role at another branch, since roles are global", async () => {
    const rawSessionId = await insertSession(administratorId);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other branch returned no row");
    }
    const someoneElseId = await insertUser({
      firstName: "Someone Else",
      email: "someone@example.com",
      roleId,
      locationId: otherLocation.id,
    });

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera senior",
      permissions: ["sell_and_charge"],
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user_count: 1,
      assigned_users: [{ id: someoneElseId, name: "Someone Else" }],
    });
  });

  it("answers and audits the new permissions in catalog order, whatever order they were sent in", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await editRoleRequest(roleId, rawSessionId, {
      name: "Cajera",
      permissions: ["adjust_stock", "view_stock_balances", "sell_and_charge"],
      version: 1,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().permissions).toEqual([
      "sell_and_charge",
      "view_stock_balances",
      "adjust_stock",
    ]);
    const [editAudit] = await db.select().from(auditLog).where(eq(auditLog.entityId, roleId));
    expect(editAudit?.newValue).toEqual({
      name: "Cajera",
      permissions: ["sell_and_charge", "view_stock_balances", "adjust_stock"],
    });
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required when the session's passkey authorization is stale, changing nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await editRoleRequest(roleId, rawSessionId, {
        name: "Cajera nueva",
        permissions: [],
        version: 1,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
      expect(row).toMatchObject({ name: "Cajera", version: 1 });
      const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, roleId));
      expect(audited).toHaveLength(0);
    });
  });
});

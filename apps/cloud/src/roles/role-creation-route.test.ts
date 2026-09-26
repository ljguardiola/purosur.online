import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { auditLog, roles, sessions, userRoles, users } from "../db/schema.js";
import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "../session/passkey-authorization-guard.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerRoleCreationRoutes } from "./role-creation-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let administratorId: string;
let currentTime: Date;

async function buildApp() {
  const built = Fastify();
  registerRoleCreationRoutes(built, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
  return built;
}

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

async function insertCashierRole(name: string): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
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

/** Inserts a session, authorized (by default, at `currentTime`) unless `authorizedAt` is passed as `null`. */
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
  app = await buildApp();
});

afterEach(async () => {
  await app.close();
});

describe("POST /roles", () => {
  function createRole(
    rawSessionId: string | undefined,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    return postJson(
      app,
      "/roles",
      body,
      rawSessionId ? { ...cookieHeader(rawSessionId), ...headers } : headers,
    );
  }

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await createRole(undefined, {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: "/roles",
      headers: { origin: "https://attacker.example", ...cookieHeader(rawSessionId) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
  });

  it("rejects a non-Administrator with 403 forbidden, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const cashierId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await createRole(rawSessionId, { name: "Depósito", permissions: [] });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const created = await db.select().from(roles).where(eq(roles.name, "Depósito"));
    expect(created).toHaveLength(0);
  });

  it("creates the role with exactly the chosen permissions and audits the actor", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: ["view_stock_balances", "adjust_stock"],
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: body.id,
      name: "Depósito",
      is_administrator: false,
      permissions: ["view_stock_balances", "adjust_stock"],
      user_count: 0,
    });

    const [createdRole] = await db.select().from(roles).where(eq(roles.id, body.id));
    expect(createdRole).toMatchObject({ name: "Depósito", isAdministrator: false });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "role"));
    const creationAudit = audited.find((row) => row.entityId === body.id);
    expect(creationAudit).toMatchObject({
      actorId: administratorId,
      previousValue: null,
      newValue: { name: "Depósito", permissions: ["view_stock_balances", "adjust_stock"] },
    });
  });

  it("creates a role holding no permissions", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await createRole(rawSessionId, { name: "Sin permisos", permissions: [] });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: "Sin permisos", permissions: [] });
  });

  it("rejects an empty name, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await createRole(rawSessionId, { name: "   ", permissions: [] });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "name" }],
    });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  it("rejects a name already taken, case-insensitively, creating nothing", async () => {
    await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);

    const response = await createRole(rawSessionId, { name: "CAJERA", permissions: [] });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "role_name_taken" });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(1);
  });

  it("rejects an unknown permission key, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await createRole(rawSessionId, {
      name: "Depósito",
      permissions: ["not_a_real_permission"],
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "validation_failed",
      details: [{ field: "permissions" }],
    });
    const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(created).toHaveLength(0);
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required and creates nothing when the session was never authorized", async () => {
      const rawSessionId = await insertSession(administratorId, null);

      const response = await createRole(rawSessionId, { name: "Depósito", permissions: [] });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
      expect(created).toHaveLength(0);
      const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "role"));
      expect(audited).toHaveLength(0);
    });

    it("returns 401 authorization_required when the session's passkey authorization is stale, creating nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await createRole(rawSessionId, { name: "Depósito", permissions: [] });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const created = await db.select().from(roles).where(eq(roles.isAdministrator, false));
      expect(created).toHaveLength(0);
    });

    it("does not count another session's authorization for the same account", async () => {
      await insertSession(administratorId, NOON);
      const rawSessionId = await insertSession(administratorId, null);

      const response = await createRole(rawSessionId, { name: "Depósito", permissions: [] });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
    });

    it("is not consumed: the same authorization covers a second creation", async () => {
      const rawSessionId = await insertSession(administratorId);

      const first = await createRole(rawSessionId, { name: "Depósito", permissions: [] });
      const second = await createRole(rawSessionId, { name: "Ventas", permissions: [] });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
    });
  });
});

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { auditLog, locations, passkeys, roles, sessions, userRoles, users } from "../db/schema.js";
import { processRecoveryRequestJob } from "../recovery/process-recovery-request-job.js";
import { PASSKEY_AUTHORIZATION_WINDOW_MS } from "../session/passkey-authorization-guard.js";
import { SESSION_COOKIE_NAME } from "../session/session-cookie.js";
import { generateSessionId, hashSessionId } from "../session/session-id.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { registerUserCreationRoutes } from "./user-creation-route.js";

const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let app: FastifyInstance;
let administratorId: string;
let currentTime: Date;

async function buildApp() {
  const built = Fastify();
  registerUserCreationRoutes(built, {
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

describe("POST /users", () => {
  function createUser(
    rawSessionId: string | undefined,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    return postJson(
      app,
      "/users",
      body,
      rawSessionId ? { ...cookieHeader(rawSessionId), ...headers } : headers,
    );
  }

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await createUser(undefined, {});

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await app.inject({
      method: "POST",
      url: "/users",
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

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("creates the user in the session's branch with the chosen role, no passkeys, and audits the actor", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const locationId = await seededLocationId(db);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "NewHire@Example.com",
      role_id: cashierRoleId,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toEqual({
      id: body.id,
      first_name: "New Hire",
      email: "newhire@example.com",
      version: 1,
      role: { id: cashierRoleId, is_administrator: false, name: "Cajera" },
      passkey_count: 0,
      is_last_active_administrator: false,
    });

    const [createdUser] = await db.select().from(users).where(eq(users.id, body.id));
    expect(createdUser).toMatchObject({
      firstName: "New Hire",
      email: "newhire@example.com",
      active: true,
      locationId,
    });
    const createdPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, body.id));
    expect(createdPasskeys).toHaveLength(0);
    const createdRoles = await db.select().from(userRoles).where(eq(userRoles.userId, body.id));
    expect(createdRoles).toEqual([{ userId: body.id, roleId: cashierRoleId }]);

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "user"));
    const creationAudit = audited.find((row) => row.entityId === body.id);
    expect(creationAudit).toMatchObject({
      actorId: administratorId,
      previousValue: null,
      newValue: { firstName: "New Hire", email: "newhire@example.com", roleId: cashierRoleId },
    });
  });

  it("rejects an unknown role id, creating nothing", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: randomUUID(),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "unknown_role" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("rejects a duplicate email with 409, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    await insertUser({
      firstName: "Existing User",
      email: "taken@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "Taken@Example.com",
      role_id: cashierRoleId,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "email_taken" });
    const matching = await db.select().from(users).where(eq(users.email, "taken@example.com"));
    expect(matching).toHaveLength(1);
  });

  it("answers email_belongs_to_deactivated_user with that user's id and name when the email belongs to a deactivated user, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const deactivatedId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    await db.update(users).set({ active: false }).where(eq(users.id, deactivatedId));
    const rawSessionId = await insertSession(administratorId);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "Grace@Example.com",
      role_id: cashierRoleId,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: "email_belongs_to_deactivated_user",
      id: deactivatedId,
      name: "Grace Hopper",
    });
    const matching = await db.select().from(users).where(eq(users.email, "grace@example.com"));
    expect(matching).toHaveLength(1);
  });

  it("answers plain email_taken, naming nobody, when the email belongs to a deactivated user of another branch", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) throw new Error("test setup: seeding the other location returned no row");
    const strangerId = await insertUser({
      firstName: "Stranger",
      email: "stranger@example.com",
      roleId: cashierRoleId,
      locationId: otherLocation.id,
    });
    await db.update(users).set({ active: false }).where(eq(users.id, strangerId));
    const rawSessionId = await insertSession(administratorId);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "stranger@example.com",
      role_id: cashierRoleId,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "email_taken" });
    expect(response.json()).not.toHaveProperty("id");
    expect(response.json()).not.toHaveProperty("name");
    const matching = await db.select().from(users).where(eq(users.email, "stranger@example.com"));
    expect(matching).toHaveLength(1);
  });

  it("ignores location/branch fields sent in the body, always using the session's own branch", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) throw new Error("test setup: seeding the other location returned no row");
    const sessionLocationId = await seededLocationId(db);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
      location_id: otherLocation.id,
    });

    expect(response.statusCode).toBe(201);
    const [createdUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, "newhire@example.com"));
    expect(createdUser?.locationId).toBe(sessionLocationId);
  });

  it("rejects an empty first name, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);

    const response = await createUser(rawSessionId, {
      first_name: "   ",
      email: "newhire@example.com",
      role_id: cashierRoleId,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
    const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
    expect(created).toHaveLength(0);
  });

  it("rejects a malformed email, creating nothing", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);

    const response = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "not-an-email",
      role_id: cashierRoleId,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_failed" });
  });

  it("lets the new user get in through the recovery link", async () => {
    const cashierRoleId = await insertCashierRole("Cajera");
    const rawSessionId = await insertSession(administratorId);

    const created = await createUser(rawSessionId, {
      first_name: "New Hire",
      email: "newhire@example.com",
      role_id: cashierRoleId,
    });
    expect(created.statusCode).toBe(201);

    const result = await processRecoveryRequestJob(
      db,
      {
        email: "newhire@example.com",
        requestedAt: currentTime.toISOString(),
        requestId: randomUUID(),
      },
      { now: () => currentTime, backofficeOrigin: BACKOFFICE_ORIGIN },
    );

    expect(result.send).toMatchObject({ to: "newhire@example.com" });
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required and creates nothing when the session was never authorized", async () => {
      const cashierRoleId = await insertCashierRole("Cajera");
      const rawSessionId = await insertSession(administratorId, null);

      const response = await createUser(rawSessionId, {
        first_name: "New Hire",
        email: "newhire@example.com",
        role_id: cashierRoleId,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
      expect(created).toHaveLength(0);
    });

    it("returns 401 authorization_required when the session's passkey authorization is stale, creating nothing", async () => {
      const cashierRoleId = await insertCashierRole("Cajera");
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await createUser(rawSessionId, {
        first_name: "New Hire",
        email: "newhire@example.com",
        role_id: cashierRoleId,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const created = await db.select().from(users).where(eq(users.email, "newhire@example.com"));
      expect(created).toHaveLength(0);
    });
  });
});

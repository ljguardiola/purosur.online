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
import { registerUserDeactivationRoutes } from "./user-deactivation-route.js";

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

/**
 * Runs `change` once the route has read its target (the branch-user read, the only one selecting
 * `roleIsAdministrator`) and just before the next transaction it opens: the window in which a
 * concurrent request can commit a change the route has not seen. Transactions opened earlier, by
 * the session check, run untouched.
 */
function withChangeAfterTargetRead(change: () => Promise<unknown>): TestDatabase["db"] {
  let targetRead = false;
  let changed = false;
  return new Proxy(db, {
    get(target, property) {
      const value = Reflect.get(target, property);
      if (property === "select") {
        return function (this: unknown, ...args: unknown[]) {
          const [fields] = args;
          if (typeof fields === "object" && fields !== null && "roleIsAdministrator" in fields) {
            targetRead = true;
          }
          return Reflect.apply(value, this, args);
        };
      }
      if (property === "transaction") {
        return async function (this: unknown, ...args: unknown[]) {
          if (targetRead && !changed) {
            changed = true;
            await change();
          }
          return Reflect.apply(value, this, args);
        };
      }
      return value;
    },
  });
}

function deactivateUser(
  targetId: string,
  rawSessionId: string | undefined,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/users/${targetId}/deactivation`,
    headers: {
      origin: BACKOFFICE_ORIGIN,
      ...(rawSessionId ? cookieHeader(rawSessionId) : {}),
      ...headers,
    },
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
  app = Fastify();
  registerUserDeactivationRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
});

describe("POST /users/:id/deactivation", () => {
  let cashierRoleId: string;
  let targetId: string;

  beforeEach(async () => {
    cashierRoleId = await insertRole("Cajera");
    targetId = await insertUser({
      firstName: "Grace Hopper",
      email: "grace@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await deactivateUser(targetId, undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await deactivateUser(targetId, rawSessionId, {
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.active).toBe(true);
  });

  it("rejects a user without the deactivate_users permission with 403 forbidden, changing nothing", async () => {
    const rawSessionId = await insertSession(targetId);

    const response = await deactivateUser(targetId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.active).toBe(true);
  });

  it("answers the identical 404 for another branch's target id, a missing one, and a malformed one, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) throw new Error("test setup: seeding the other location returned no row");
    const strangerId = await insertUser({
      firstName: "Stranger",
      email: "stranger@example.com",
      roleId: cashierRoleId,
      locationId: otherLocation.id,
    });

    const crossBranchResponse = await deactivateUser(strangerId, rawSessionId);
    const missingResponse = await deactivateUser(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
    );
    const malformedResponse = await deactivateUser("not-a-uuid", rawSessionId);

    expect(crossBranchResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(crossBranchResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(malformedResponse.json());
  });

  it("answers not_found for a target already inactive, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    await db.update(users).set({ active: false }).where(eq(users.id, targetId));

    const response = await deactivateUser(targetId, rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("answers the same 404 for an Administrator target as for a missing one, even from another Administrator, leaving them active", async () => {
    const otherAdministratorId = await insertUser({
      firstName: "Zoe Admin",
      email: "zoe@example.com",
      roleId: await seededAdministratorRoleId(),
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(administratorId);

    const administratorTargetResponse = await deactivateUser(otherAdministratorId, rawSessionId);
    const missingResponse = await deactivateUser(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
    );

    expect(administratorTargetResponse.statusCode).toBe(404);
    expect(administratorTargetResponse.json()).toEqual(missingResponse.json());
    const [row] = await db.select().from(users).where(eq(users.id, otherAdministratorId));
    expect(row?.active).toBe(true);
  });

  it("answers the same 404 for the holder's own account as for a missing one, in any letter case, leaving them active", async () => {
    const holderRoleId = await insertRole("Encargada", ["deactivate_users"]);
    const holderId = await insertUser({
      firstName: "Barbara Liskov",
      email: "barbara@example.com",
      roleId: holderRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(holderId);

    const ownResponse = await deactivateUser(holderId, rawSessionId);
    const ownUpperCaseResponse = await deactivateUser(holderId.toUpperCase(), rawSessionId);
    const missingResponse = await deactivateUser(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
    );

    expect(ownResponse.statusCode).toBe(404);
    expect(ownUpperCaseResponse.statusCode).toBe(404);
    expect(ownResponse.json()).toEqual(missingResponse.json());
    expect(ownUpperCaseResponse.json()).toEqual(missingResponse.json());
    const [row] = await db.select().from(users).where(eq(users.id, holderId));
    expect(row?.active).toBe(true);
  });

  it("deactivates a non-admin target, bumps its version, ends every open session of the target, leaves the actor's own session untouched, and audits the actor", async () => {
    const targetSession1 = await insertSession(targetId);
    const targetSession2 = await insertSession(targetId);
    const rawSessionId = await insertSession(administratorId);

    const response = await deactivateUser(targetId, rawSessionId);

    expect(response.statusCode).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.active).toBe(false);
    expect(row?.version).toBe(2);

    const [session1Row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(targetSession1)));
    const [session2Row] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(targetSession2)));
    expect(session1Row?.revokedAt).not.toBeNull();
    expect(session2Row?.revokedAt).not.toBeNull();
    const [adminSessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(rawSessionId)));
    expect(adminSessionRow?.revokedAt).toBeNull();

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "user"));
    const deactivationAudit = audited.find((row) => row.entityId === targetId);
    expect(deactivationAudit).toMatchObject({
      actorId: administratorId,
      previousValue: { active: true },
      newValue: { active: false },
    });
  });

  it("allows a holder of only deactivate_users, not an Administrator, to deactivate a user", async () => {
    const holderRoleId = await insertRole("Encargada", ["deactivate_users"]);
    const holderId = await insertUser({
      firstName: "Barbara Liskov",
      email: "barbara@example.com",
      roleId: holderRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(holderId);

    const response = await deactivateUser(targetId, rawSessionId);

    expect(response.statusCode).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.active).toBe(false);
  });

  it("answers not_found to a second deactivation of an already deactivated target, auditing only the first", async () => {
    const rawSessionId = await insertSession(administratorId);
    const first = await deactivateUser(targetId, rawSessionId);
    expect(first.statusCode).toBe(200);

    const second = await deactivateUser(targetId, rawSessionId);

    expect(second.statusCode).toBe(404);
    expect(second.json()).toMatchObject({ code: "not_found" });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "user"));
    const deactivations = audited.filter((row) => row.entityId === targetId);
    expect(deactivations).toHaveLength(1);
  });

  it("answers the same 404 for a target promoted to Administrator after it was first read, leaving them active and their sessions open", async () => {
    const targetSessionId = await insertSession(targetId);
    const rawSessionId = await insertSession(administratorId);
    const administratorRoleId = await seededAdministratorRoleId();
    const racedApp = Fastify();
    registerUserDeactivationRoutes(racedApp, {
      db: withChangeAfterTargetRead(() =>
        db
          .update(userRoles)
          .set({ roleId: administratorRoleId })
          .where(eq(userRoles.userId, targetId)),
      ),
      backofficeOrigin: BACKOFFICE_ORIGIN,
      now: () => currentTime,
    });

    const response = await racedApp.inject({
      method: "POST",
      url: `/users/${targetId}/deactivation`,
      headers: { origin: BACKOFFICE_ORIGIN, ...cookieHeader(rawSessionId) },
    });
    await racedApp.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.active).toBe(true);
    const [targetSessionRow] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionIdHash, hashSessionId(targetSessionId)));
    expect(targetSessionRow?.revokedAt).toBeNull();
    const audited = await db.select().from(auditLog).where(eq(auditLog.entityId, targetId));
    expect(audited).toHaveLength(0);
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required and changes nothing when the session was never authorized", async () => {
      const rawSessionId = await insertSession(administratorId, null);

      const response = await deactivateUser(targetId, rawSessionId);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db.select().from(users).where(eq(users.id, targetId));
      expect(row?.active).toBe(true);
    });

    it("allows the action at exactly the 5-minute boundary", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await deactivateUser(targetId, rawSessionId);

      expect(response.statusCode).toBe(200);
    });

    it("returns 401 authorization_required one second past the 5-minute boundary, changing nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await deactivateUser(targetId, rawSessionId);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db.select().from(users).where(eq(users.id, targetId));
      expect(row?.active).toBe(true);
    });
  });
});

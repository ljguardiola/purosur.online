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
import { registerUserReactivationRoutes } from "./user-reactivation-route.js";

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

function reactivateUser(
  targetId: string,
  rawSessionId: string | undefined,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method: "POST",
    url: `/users/${targetId}/reactivation`,
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
  registerUserReactivationRoutes(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => currentTime,
  });
});

afterEach(async () => {
  await app.close();
});

describe("POST /users/:id/reactivation", () => {
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
    await db.update(users).set({ active: false }).where(eq(users.id, targetId));
  });

  it("returns 401 unauthenticated when no cookie was sent", async () => {
    const response = await reactivateUser(targetId, undefined);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("rejects an Origin that is not the backoffice's own", async () => {
    const rawSessionId = await insertSession(administratorId);

    const response = await reactivateUser(targetId, rawSessionId, {
      origin: "https://attacker.example",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "origin_rejected" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.active).toBe(false);
  });

  it("rejects a user without the reactivate_users permission with 403 forbidden, changing nothing", async () => {
    const cashierId = await insertUser({
      firstName: "Barbara Liskov",
      email: "barbara@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(cashierId);

    const response = await reactivateUser(targetId, rawSessionId);

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "forbidden" });
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.active).toBe(false);
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
    await db.update(users).set({ active: false }).where(eq(users.id, strangerId));

    const crossBranchResponse = await reactivateUser(strangerId, rawSessionId);
    const missingResponse = await reactivateUser(
      "00000000-0000-0000-0000-000000000000",
      rawSessionId,
    );
    const malformedResponse = await reactivateUser("not-a-uuid", rawSessionId);

    expect(crossBranchResponse.statusCode).toBe(404);
    expect(missingResponse.statusCode).toBe(404);
    expect(malformedResponse.statusCode).toBe(404);
    expect(crossBranchResponse.json()).toEqual(missingResponse.json());
    expect(missingResponse.json()).toEqual(malformedResponse.json());
  });

  it("answers not_found for a target that is still active, changing nothing", async () => {
    const rawSessionId = await insertSession(administratorId);
    const activeId = await insertUser({
      firstName: "Katherine Johnson",
      email: "katherine@example.com",
      roleId: cashierRoleId,
      locationId: await seededLocationId(db),
    });

    const response = await reactivateUser(activeId, rawSessionId);

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "not_found" });
  });

  it("reactivates an inactive target, bumps its version, keeps role/email/passkeys untouched, and audits the actor", async () => {
    const rawSessionId = await insertSession(administratorId);
    const [before] = await db.select().from(users).where(eq(users.id, targetId));

    const response = await reactivateUser(targetId, rawSessionId);

    expect(response.statusCode).toBe(200);

    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.active).toBe(true);
    expect(row?.version).toBe((before?.version ?? 1) + 1);
    expect(row?.email).toBe(before?.email);

    const rolesAfter = await db.select().from(userRoles).where(eq(userRoles.userId, targetId));
    expect(rolesAfter).toEqual([{ userId: targetId, roleId: cashierRoleId }]);

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "user"));
    const reactivationAudit = audited.find((auditRow) => auditRow.entityId === targetId);
    expect(reactivationAudit).toMatchObject({
      actorId: administratorId,
      previousValue: { active: false },
      newValue: { active: true },
    });
  });

  it("allows a holder of only reactivate_users, not an Administrator, to reactivate a user", async () => {
    const holderRoleId = await insertRole("Encargada", ["reactivate_users"]);
    const holderId = await insertUser({
      firstName: "Barbara Liskov",
      email: "barbara@example.com",
      roleId: holderRoleId,
      locationId: await seededLocationId(db),
    });
    const rawSessionId = await insertSession(holderId);

    const response = await reactivateUser(targetId, rawSessionId);

    expect(response.statusCode).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.id, targetId));
    expect(row?.active).toBe(true);
  });

  it("answers not_found to a second reactivation of an already reactivated target, auditing only the first", async () => {
    const rawSessionId = await insertSession(administratorId);
    const first = await reactivateUser(targetId, rawSessionId);
    expect(first.statusCode).toBe(200);

    const second = await reactivateUser(targetId, rawSessionId);

    expect(second.statusCode).toBe(404);
    expect(second.json()).toMatchObject({ code: "not_found" });
    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "user"));
    const reactivations = audited.filter((row) => row.entityId === targetId);
    expect(reactivations).toHaveLength(1);
  });

  describe("the shared passkey-authorization guard", () => {
    it("returns 401 authorization_required and changes nothing when the session was never authorized", async () => {
      const rawSessionId = await insertSession(administratorId, null);

      const response = await reactivateUser(targetId, rawSessionId);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db.select().from(users).where(eq(users.id, targetId));
      expect(row?.active).toBe(false);
    });

    it("allows the action at exactly the 5-minute boundary", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await reactivateUser(targetId, rawSessionId);

      expect(response.statusCode).toBe(200);
    });

    it("returns 401 authorization_required one second past the 5-minute boundary, changing nothing", async () => {
      const authorizedAt = new Date(NOON.getTime() - PASSKEY_AUTHORIZATION_WINDOW_MS - 1000);
      const rawSessionId = await insertSession(administratorId, authorizedAt);

      const response = await reactivateUser(targetId, rawSessionId);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "authorization_required" });
      const [row] = await db.select().from(users).where(eq(users.id, targetId));
      expect(row?.active).toBe(false);
    });
  });
});

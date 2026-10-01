import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rolePermissions, roles, sessions, userRoles, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { drizzleSessions } from "./drizzle-sessions.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let branch: string;

const CREATED_AT = new Date("2026-10-01T08:00:00.000Z");
const LAST_SEEN_AT = new Date("2026-10-01T09:00:00.000Z");

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  branch = await seededLocationId(db);
});

async function insertRole(isAdministrator: boolean, permissionKeys: string[]): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name: isAdministrator ? null : "Cajero", isAdministrator })
    .returning({ id: roles.id });
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

async function insertUser(roleId: string | undefined, active = true): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({ firstName: "Ana", email: "ana@example.test", locationId: branch, active })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  if (roleId) {
    await db.insert(userRoles).values({ userId: user.id, roleId });
  }
  return user.id;
}

async function insertSession(
  userId: string,
  sessionIdHash: string,
  extra: Partial<typeof sessions.$inferInsert> = {},
): Promise<string> {
  const [session] = await db
    .insert(sessions)
    .values({ userId, sessionIdHash, createdAt: CREATED_AT, lastSeenAt: LAST_SEEN_AT, ...extra })
    .returning({ id: sessions.id });
  if (!session) {
    throw new Error("test setup: seeding the session returned no row");
  }
  return session.id;
}

describe("drizzleSessions", () => {
  describe("findSession", () => {
    it("finds a session by its key with its user and the permissions of the user's role", async () => {
      const roleId = await insertRole(false, ["sell_and_charge", "view_sales_history"]);
      const userId = await insertUser(roleId);
      const passkeyAuthorizedAt = new Date("2026-10-01T09:30:00.000Z");
      const sessionId = await insertSession(userId, "hash-1", { passkeyAuthorizedAt });

      const found = await drizzleSessions(db).findSession("hash-1");

      expect(found).toMatchObject({
        sessionId,
        userId,
        firstName: "Ana",
        locationId: branch,
        createdAt: CREATED_AT,
        lastSeenAt: LAST_SEEN_AT,
        revokedAt: null,
        passkeyAuthorizedAt,
        userActive: true,
        isAdministrator: false,
      });
      expect([...(found?.grantedPermissionKeys ?? [])].sort()).toEqual([
        "sell_and_charge",
        "view_sales_history",
      ]);
    });

    it("finds the session of an administrator as one", async () => {
      const userId = await insertUser(await insertRole(true, []));
      await insertSession(userId, "hash-1");

      const found = await drizzleSessions(db).findSession("hash-1");

      expect(found).toMatchObject({ isAdministrator: true, grantedPermissionKeys: [] });
    });

    it("finds the session of a user without a role as holding nothing", async () => {
      const userId = await insertUser(undefined);
      await insertSession(userId, "hash-1");

      const found = await drizzleSessions(db).findSession("hash-1");

      expect(found).toMatchObject({ isAdministrator: false, grantedPermissionKeys: [] });
    });

    it("reports a revoked session and a deactivated user as they are stored", async () => {
      const revokedAt = new Date("2026-10-01T09:10:00.000Z");
      const userId = await insertUser(await insertRole(false, []), false);
      await insertSession(userId, "hash-1", { revokedAt });

      const found = await drizzleSessions(db).findSession("hash-1");

      expect(found).toMatchObject({ revokedAt, userActive: false });
    });

    it("finds only the session whose key it is given", async () => {
      const userId = await insertUser(await insertRole(false, []));
      await insertSession(userId, "hash-1");
      const other = await insertSession(userId, "hash-2");

      const found = await drizzleSessions(db).findSession("hash-2");

      expect(found?.sessionId).toBe(other);
    });

    it("finds nothing for a key no session has", async () => {
      expect(await drizzleSessions(db).findSession("missing")).toBeUndefined();
    });
  });
});

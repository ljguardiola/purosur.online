import { UserEmailConflict, type UserStoreTransaction } from "@purosur/domain/access/use-cases";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  alerts,
  auditLog,
  changes,
  recoveryTokens,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { PendingChanges } from "../sync/change-log.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleUserStore } from "./drizzle-user-store.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let locationId: string;
let actorId: string;
let cashierRoleId: string;
let administratorRoleId: string;

const NOW = new Date("2026-10-01T12:00:00.000Z");
const LATER = new Date("2026-10-01T13:00:00.000Z");

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

async function insertUser(firstName: string, email: string, active = true): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ firstName, email, locationId, active })
    .returning({ id: users.id });
  if (!row) {
    throw new Error("test setup: seeding a user returned no row");
  }
  return row.id;
}

beforeEach(async () => {
  await testDatabase.clear();
  locationId = await seededLocationId(db);
  actorId = await insertUser("Ada", "ada@example.com");
  const [cashier] = await db
    .insert(roles)
    .values({ name: "Cajero", isAdministrator: false })
    .returning({ id: roles.id });
  const [administrator] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!cashier || !administrator) {
    throw new Error("test setup: the roles are missing");
  }
  cashierRoleId = cashier.id;
  administratorRoleId = administrator.id;
});

const store = () => new DrizzleUserStore(db);

async function loggedUserChanges(userId: string) {
  return db
    .select({
      version: changes.version,
      op: changes.op,
      locationId: changes.locationId,
    })
    .from(changes)
    .where(eq(changes.entityId, userId))
    .orderBy(asc(changes.changeSeq));
}

describe("inserting a user", () => {
  it("stores the user as active at its first version and logs the insert for its branch", async () => {
    const inserted = await store().transaction((tx) =>
      tx.insertUser({ firstName: "Marta", email: "marta@example.com", locationId }),
    );

    expect(inserted.version).toBe(1);
    const [stored] = await db.select().from(users).where(eq(users.id, inserted.id));
    expect(stored).toMatchObject({ firstName: "Marta", email: "marta@example.com", active: true });
    expect(await loggedUserChanges(inserted.id)).toEqual([
      { version: 1, op: "insert", locationId },
    ]);
  });

  it("raises the email conflict, logs nothing and leaves the transaction usable when another user holds the email", async () => {
    await db.insert(userRoles).values({ userId: actorId, roleId: cashierRoleId });

    const { conflict, holder } = await store().transaction(async (tx) => {
      const conflict = await tx
        .insertUser({ firstName: "Otra", email: "ada@example.com", locationId })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      return {
        conflict,
        holder: await tx.users.branchUserWithEmail(locationId, "ada@example.com", "active"),
      };
    });

    expect(conflict).toBeInstanceOf(UserEmailConflict);
    expect(holder).toMatchObject({ id: actorId, firstName: "Ada" });
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(changes).where(eq(changes.entity, "user"))).toEqual([]);
  });
});

describe("rewriting a user", () => {
  it("writes only the fields it is given and logs the update for the given branch", async () => {
    const userId = await insertUser("Beto", "beto@example.com");

    await store().transaction((tx) =>
      tx.rewriteUser(userId, { version: 2, locationId, active: false }),
    );

    const [stored] = await db.select().from(users).where(eq(users.id, userId));
    expect(stored).toMatchObject({ email: "beto@example.com", active: false, version: 2 });
    expect(await loggedUserChanges(userId)).toEqual([{ version: 2, op: "update", locationId }]);
  });

  it("changes the email", async () => {
    const userId = await insertUser("Beto", "beto@example.com");

    await store().transaction((tx) =>
      tx.rewriteUser(userId, { version: 2, locationId, email: "nuevo@example.com" }),
    );

    const [stored] = await db.select().from(users).where(eq(users.id, userId));
    expect(stored).toMatchObject({ email: "nuevo@example.com", active: true });
  });

  it("raises the email conflict when another user holds the email", async () => {
    const userId = await insertUser("Beto", "beto@example.com");

    const attempt = store().transaction((tx) =>
      tx.rewriteUser(userId, { version: 2, locationId, email: "ada@example.com" }),
    );

    await expect(attempt).rejects.toBeInstanceOf(UserEmailConflict);
  });
});

describe("locking a user", () => {
  it("answers the stored facts of the user", async () => {
    const userId = await insertUser("Beto", "beto@example.com", false);

    const locked = await store().transaction((tx) => tx.lockUser(userId));

    expect(locked).toEqual({
      email: "beto@example.com",
      version: 1,
      active: false,
      locationId,
    });
  });

  it("treats a missing user as not there when locking it for deactivation", async () => {
    await store().transaction(async (tx) => {
      expect(await tx.lockUserForDeactivation("00000000-0000-4000-8000-000000000000")).toBe(
        undefined,
      );
    });
  });

  it("answers the stored facts of the user when locking for deactivation", async () => {
    const userId = await insertUser("Beto", "beto@example.com");

    const locked = await store().transaction((tx) => tx.lockUserForDeactivation(userId));

    expect(locked).toMatchObject({ active: true, version: 1, locationId });
  });
});

describe("roles", () => {
  it("assigns a role, moves the user to another and tells which one they hold", async () => {
    const userId = await insertUser("Beto", "beto@example.com");

    await store().transaction(async (tx) => {
      await tx.assignRole(userId, cashierRoleId);
      expect(await tx.roleOfUser(userId)).toEqual({
        id: cashierRoleId,
        name: "Cajero",
        isAdministrator: false,
      });
      await tx.reassignRole(userId, administratorRoleId);
    });

    const [held] = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    expect(held?.roleId).toBe(administratorRoleId);
  });

  it("locks the role with its permissions for assignment", async () => {
    await db
      .insert(rolePermissions)
      .values({ roleId: cashierRoleId, permissionKey: "sell_and_charge" });

    const locked = await store().transaction((tx) => tx.lockRoleForAssignment(cashierRoleId));

    expect(locked).toEqual({
      name: "Cajero",
      isAdministrator: false,
      permissionKeys: ["sell_and_charge"],
    });
  });

  it("refuses to lock a role that no longer exists", async () => {
    await expect(
      store().transaction((tx) => tx.lockRoleForAssignment("00000000-0000-4000-8000-000000000000")),
    ).rejects.toThrow("an assigned role no longer exists");
  });

  it("finds the single Administrator role", async () => {
    const found = await store().transaction((tx) => tx.lockAdministratorRole());

    expect(found).toEqual({ id: administratorRoleId });
  });
});

describe("voiding recovery links", () => {
  it("voids only the unused, unvoided links of the given user", async () => {
    const userId = await insertUser("Beto", "beto@example.com");
    const otherId = await insertUser("Cora", "cora@example.com");
    const expiresAt = new Date(NOW.getTime() + 900_000);
    const link = (id: string, hash: string, extra: { usedAt?: Date; voidedAt?: Date } = {}) =>
      db.insert(recoveryTokens).values({
        userId: id,
        tokenHash: hash,
        issuedAt: NOW,
        expiresAt,
        ...extra,
      });
    await link(userId, "live");
    await link(userId, "used", { usedAt: NOW });
    await link(userId, "voided-before", { voidedAt: NOW });
    await link(otherId, "someone-else");

    await store().transaction((tx) => tx.voidOutstandingRecoveryTokens(userId, LATER));

    const rows = await db
      .select({ hash: recoveryTokens.tokenHash, voidedAt: recoveryTokens.voidedAt })
      .from(recoveryTokens)
      .orderBy(asc(recoveryTokens.tokenHash));
    expect(rows).toEqual([
      { hash: "live", voidedAt: LATER },
      { hash: "someone-else", voidedAt: null },
      { hash: "used", voidedAt: null },
      { hash: "voided-before", voidedAt: NOW },
    ]);
  });
});

describe("revoking sessions", () => {
  it("revokes only the live sessions of the given user", async () => {
    const userId = await insertUser("Beto", "beto@example.com");
    await db.insert(sessions).values([
      { userId, sessionIdHash: "live" },
      { userId, sessionIdHash: "revoked-before", revokedAt: NOW },
      { userId: actorId, sessionIdHash: "someone-else" },
    ]);

    await store().transaction((tx) => tx.revokeSessions(userId, LATER));

    const rows = await db
      .select({ hash: sessions.sessionIdHash, revokedAt: sessions.revokedAt })
      .from(sessions)
      .orderBy(asc(sessions.sessionIdHash));
    expect(rows).toEqual([
      { hash: "live", revokedAt: LATER },
      { hash: "revoked-before", revokedAt: NOW },
      { hash: "someone-else", revokedAt: null },
    ]);
  });
});

describe("recording what changed", () => {
  async function auditRow(record: (tx: UserStoreTransaction) => Promise<void>) {
    await store().transaction(record);
    const [row] = await db.select().from(auditLog).where(eq(auditLog.entity, "user"));
    return row;
  }

  it("records a creation with no previous value", async () => {
    const row = await auditRow((tx) =>
      tx.recordUserChange(actorId, actorId, {
        kind: "created",
        firstName: "Marta",
        email: "marta@example.com",
        roleId: cashierRoleId,
      }),
    );

    expect(row).toMatchObject({
      entityId: actorId,
      actorId,
      previousValue: null,
      newValue: { firstName: "Marta", email: "marta@example.com", roleId: cashierRoleId },
    });
  });

  it("records an email change with the previous and the new email", async () => {
    const row = await auditRow((tx) =>
      tx.recordUserChange(actorId, actorId, {
        kind: "email_changed",
        previousEmail: "ada@example.com",
        email: "nueva@example.com",
      }),
    );

    expect(row).toMatchObject({
      previousValue: { email: "ada@example.com" },
      newValue: { email: "nueva@example.com" },
    });
  });

  it("records a role change with the previous and the new role", async () => {
    const row = await auditRow((tx) =>
      tx.recordUserChange(actorId, actorId, {
        kind: "role_changed",
        previousRoleId: cashierRoleId,
        roleId: administratorRoleId,
      }),
    );

    expect(row).toMatchObject({
      previousValue: { roleId: cashierRoleId },
      newValue: { roleId: administratorRoleId },
    });
  });

  it("records a deactivation and a reactivation as the change of the active flag", async () => {
    await store().transaction(async (tx) => {
      await tx.recordUserChange(actorId, actorId, { kind: "deactivated" });
      await tx.recordUserChange(actorId, actorId, { kind: "reactivated" });
    });

    const rows = await db
      .select({ previousValue: auditLog.previousValue, newValue: auditLog.newValue })
      .from(auditLog)
      .where(eq(auditLog.entity, "user"))
      .orderBy(asc(auditLog.id));
    expect(rows).toEqual(
      expect.arrayContaining([
        { previousValue: { active: true }, newValue: { active: false } },
        { previousValue: { active: false }, newValue: { active: true } },
      ]),
    );
  });
});

describe("opening alerts", () => {
  it("opens the alert of a user created as an administrator", async () => {
    await store().transaction((tx) =>
      tx.openUserAlert({
        kind: "created_as_administrator",
        userId: actorId,
        actorId,
        openedAt: NOW,
      }),
    );

    const [opened] = await db.select().from(alerts);
    expect(opened).toMatchObject({
      kind: "user_access_increased",
      scope: actorId,
      openedAt: NOW,
      detail: { cause: "created_as_administrator", actorId },
    });
  });

  it("opens the alert of a changed email", async () => {
    await store().transaction((tx) =>
      tx.openUserAlert({
        kind: "email_changed",
        userId: actorId,
        previousEmail: "ada@example.com",
        newEmail: "nueva@example.com",
        actorId,
        openedAt: NOW,
      }),
    );

    const [opened] = await db.select().from(alerts);
    expect(opened).toMatchObject({
      kind: "user_email_changed",
      scope: actorId,
      openedAt: NOW,
      detail: { previousEmail: "ada@example.com", newEmail: "nueva@example.com", actorId },
    });
  });

  it("opens the alert of an assigned role with both roles", async () => {
    await store().transaction((tx) =>
      tx.openUserAlert({
        kind: "role_assigned",
        userId: actorId,
        previousRole: { name: "Cajero", isAdministrator: false },
        newRole: { name: null, isAdministrator: true },
        actorId,
        openedAt: NOW,
      }),
    );

    const [opened] = await db.select().from(alerts);
    expect(opened).toMatchObject({
      kind: "user_access_increased",
      detail: {
        cause: "role_assigned",
        previousRole: { name: "Cajero", isAdministrator: false },
        newRole: { name: null, isAdministrator: true },
        actorId,
      },
    });
  });
});

describe("the change log", () => {
  it("logs through the collector of a caller that owns the outer transaction, and discards it on rollback", async () => {
    const pending = new PendingChanges();
    const attempt = new DrizzleUserStore(db, pending).transaction(async (tx) => {
      await tx.insertUser({ firstName: "Marta", email: "marta@example.com", locationId });
      throw new Error("the operation failed afterwards");
    });

    await expect(attempt).rejects.toThrow("the operation failed afterwards");

    expect(pending.mark()).toBe(0);
    expect(await db.select().from(users).where(eq(users.email, "marta@example.com"))).toEqual([]);
  });
});

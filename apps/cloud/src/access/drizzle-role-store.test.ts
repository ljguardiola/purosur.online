import { createRole, editRole, RoleNameConflict } from "@purosur/domain/permissions/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  alerts,
  auditLog,
  changes,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "../platform/db/schema.js";
import { PendingChanges } from "../sync/change-log.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRoleStore } from "./drizzle-role-store.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;

const NOW = new Date("2026-10-01T12:00:00.000Z");
const clock = { now: () => NOW };

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  const [actor] = await db
    .insert(users)
    .values({
      firstName: "Ada",
      email: "ada@example.com",
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  actorId = actor.id;
});

const create = (name: string, permissionKeys: string[] = ["sell_and_charge"]) =>
  createRole({ store: new DrizzleRoleStore(db, () => NOW) }, { name, permissionKeys, actorId });

const edit = (input: { id: string; name: string; permissionKeys: string[]; version: number }) =>
  editRole({ store: new DrizzleRoleStore(db, () => NOW), clock }, { ...input, actorId });

async function createdRole(name: string, permissionKeys?: string[]) {
  const outcome = await create(name, permissionKeys);
  if (outcome.kind !== "created") {
    throw new Error(`test setup: creating the role ended as ${outcome.kind}`);
  }
  return outcome.role;
}

async function loggedRoleChanges(roleId?: string) {
  return db
    .select({
      entityId: changes.entityId,
      version: changes.version,
      op: changes.op,
      locationId: changes.locationId,
    })
    .from(changes)
    .where(roleId === undefined ? eq(changes.entity, "role") : eq(changes.entityId, roleId))
    .orderBy(asc(changes.changeSeq));
}

async function storedPermissionKeys(roleId: string): Promise<string[]> {
  const rows = await db
    .select({ permissionKey: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
  return rows.map((row) => row.permissionKey).sort();
}

describe("creating a role", () => {
  it("stores the role with its permissions and logs it as an insert of its first version", async () => {
    const role = await createdRole("Depósito", ["sell_and_charge", "view_sales_history"]);

    expect(await storedPermissionKeys(role.id)).toEqual(["sell_and_charge", "view_sales_history"]);
    expect(await loggedRoleChanges(role.id)).toEqual([
      { entityId: role.id, version: 1, op: "insert", locationId: null },
    ]);
  });

  it("audits the creation with no previous value", async () => {
    const role = await createdRole("Depósito", ["sell_and_charge"]);

    const [row] = await db.select().from(auditLog).where(eq(auditLog.entityId, role.id));
    expect(row).toMatchObject({
      entity: "role",
      actorId,
      previousValue: null,
      newValue: { name: "Depósito", permissions: ["sell_and_charge"] },
    });
  });

  it("refuses a name another role has in a different letter case", async () => {
    await createdRole("Depósito");

    expect(await create("DEPÓSITO")).toEqual({ kind: "name_taken" });
    expect(
      await db.select({ id: roles.id }).from(roles).where(eq(roles.isAdministrator, false)),
    ).toHaveLength(1);
  });

  it("raises the role-name conflict when the unique index refuses a name that slipped past the check", async () => {
    const store = new DrizzleRoleStore(db, () => NOW);
    await createdRole("Depósito");

    await expect(
      store.transaction((tx) => tx.insertRole({ name: "depósito", permissionKeys: [] })),
    ).rejects.toBeInstanceOf(RoleNameConflict);
  });

  it("leaves its changes to the caller's collector when it is given one", async () => {
    const pending = new PendingChanges();
    const loggedBefore = await loggedRoleChanges();

    const outcome = await db.transaction((tx) =>
      createRole(
        { store: new DrizzleRoleStore(tx, () => NOW, pending) },
        { name: "Depósito", permissionKeys: [], actorId },
      ),
    );

    expect(outcome.kind).toBe("created");
    expect(await loggedRoleChanges()).toEqual(loggedBefore);
    await pending.log(db);
    expect(await loggedRoleChanges()).toHaveLength(loggedBefore.length + 1);
  });
});

describe("editing a role", () => {
  it("replaces the permissions, bumps the version and logs an update of the new version", async () => {
    const role = await createdRole("Cajero", ["sell_and_charge"]);

    const outcome = await edit({
      id: role.id,
      name: "Cajera",
      permissionKeys: ["view_sales_history"],
      version: 1,
    });

    expect(outcome.kind).toBe("applied");
    expect(await storedPermissionKeys(role.id)).toEqual(["view_sales_history"]);
    expect((await loggedRoleChanges(role.id)).at(-1)).toEqual({
      entityId: role.id,
      version: 2,
      op: "update",
      locationId: null,
    });
  });

  it("audits the edit with the previous and the new name and permissions", async () => {
    const role = await createdRole("Cajero", ["sell_and_charge"]);

    await edit({ id: role.id, name: "Cajera", permissionKeys: ["view_sales_history"], version: 1 });

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, role.id))
      .orderBy(asc(auditLog.at));
    expect(rows.at(-1)).toMatchObject({
      previousValue: { name: "Cajero", permissions: ["sell_and_charge"] },
      newValue: { name: "Cajera", permissions: ["view_sales_history"] },
    });
  });

  it("writes and logs nothing when the role would not change", async () => {
    const role = await createdRole("Cajero", ["sell_and_charge"]);
    const loggedBefore = await loggedRoleChanges(role.id);

    const outcome = await edit({
      id: role.id,
      name: "Cajero",
      permissionKeys: ["sell_and_charge"],
      version: 1,
    });

    expect(outcome).toMatchObject({ kind: "applied", role: { version: 1 } });
    expect(await loggedRoleChanges(role.id)).toEqual(loggedBefore);
  });

  it("refuses a rename to another role's name in a different letter case", async () => {
    await createdRole("Gerente");
    const role = await createdRole("Cajero");

    expect(await edit({ id: role.id, name: "GERENTE", permissionKeys: [], version: 1 })).toEqual({
      kind: "name_taken",
    });
  });

  it("opens an alert for each active holder when permissions are added", async () => {
    const role = await createdRole("Cajero", []);
    const [holder] = await db
      .insert(users)
      .values({
        firstName: "Beto",
        email: "beto@example.com",
        locationId: await seededLocationId(db),
      })
      .returning({ id: users.id });
    if (!holder) {
      throw new Error("test setup: seeding the holder returned no row");
    }
    await db.insert(userRoles).values({ userId: holder.id, roleId: role.id });

    await edit({ id: role.id, name: "Cajero", permissionKeys: ["sell_and_charge"], version: 1 });

    const opened = await db.select().from(alerts);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      kind: "user_access_increased",
      scope: holder.id,
      openedAt: NOW,
      detail: {
        cause: "role_permissions_added",
        roleName: "Cajero",
        addedPermissionKeys: ["sell_and_charge"],
        actorId,
      },
    });
  });
});

describe("DrizzleRoleStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzleRoleStore>
    >();
  });
});

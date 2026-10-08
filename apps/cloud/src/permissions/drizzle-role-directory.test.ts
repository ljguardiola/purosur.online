import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rolePermissions, roles, userRoles, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { drizzleRoleDirectory } from "./drizzle-role-directory.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

async function administratorRoleId(): Promise<string> {
  const [role] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!role) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return role.id;
}

async function insertRole(name: string, permissionKeys: string[] = []): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name, isAdministrator: false })
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

async function insertHolder(roleId: string, firstName: string, active = true): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName,
      email: `${firstName.toLowerCase()}@example.test`,
      locationId: await seededLocationId(db),
      active,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId });
  return user.id;
}

describe("drizzleRoleDirectory", () => {
  describe("roles", () => {
    it("lists the Administrator role first, then the others by name, with stored permissions and active holder counts", async () => {
      const cashier = await insertRole("Cajero", ["view_stock_balances"]);
      const baker = await insertRole("Almacenero");
      await insertHolder(cashier, "Ana");
      await insertHolder(cashier, "Beto", false);

      const listed = await drizzleRoleDirectory(db).roles();

      expect(listed).toEqual([
        {
          id: await administratorRoleId(),
          name: null,
          isAdministrator: true,
          storedPermissionKeys: [],
          activeHolderCount: 0,
        },
        {
          id: baker,
          name: "Almacenero",
          isAdministrator: false,
          storedPermissionKeys: [],
          activeHolderCount: 0,
        },
        {
          id: cashier,
          name: "Cajero",
          isAdministrator: false,
          storedPermissionKeys: ["view_stock_balances"],
          activeHolderCount: 1,
        },
      ]);
    });
  });

  describe("role", () => {
    it("finds a role with its version and stored permissions", async () => {
      const id = await insertRole("Cajero", ["view_stock_balances"]);

      expect(await drizzleRoleDirectory(db).role(id)).toEqual({
        id,
        name: "Cajero",
        isAdministrator: false,
        version: 1,
        storedPermissionKeys: ["view_stock_balances"],
      });
    });

    it("finds nothing for an unknown id", async () => {
      const directory = drizzleRoleDirectory(db);

      expect(await directory.role("00000000-0000-4000-8000-000000000000")).toBeUndefined();
    });
  });

  describe("activeRoleHolders", () => {
    it("lists the role's active holders ordered by first name", async () => {
      const cashier = await insertRole("Cajero");
      const zoe = await insertHolder(cashier, "Zoe");
      const ana = await insertHolder(cashier, "Ana");
      await insertHolder(cashier, "Beto", false);

      expect(await drizzleRoleDirectory(db).activeRoleHolders(cashier)).toEqual([
        { id: ana, name: "Ana" },
        { id: zoe, name: "Zoe" },
      ]);
    });
  });
});

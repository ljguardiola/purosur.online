import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { locations, passkeys, roles, userRoles, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { drizzleBranchUsers } from "./drizzle-branch-users.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let branch: string;

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

async function insertRole(name: string): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ name, isAdministrator: false })
    .returning({ id: roles.id });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  return role.id;
}

async function insertUser(input: {
  firstName: string;
  email: string;
  roleId: string;
  locationId?: string;
  active?: boolean;
}): Promise<string> {
  const [user] = await db
    .insert(users)
    .values({
      firstName: input.firstName,
      email: input.email,
      locationId: input.locationId ?? branch,
      active: input.active ?? true,
    })
    .returning({ id: users.id });
  if (!user) {
    throw new Error("test setup: seeding the user returned no row");
  }
  await db.insert(userRoles).values({ userId: user.id, roleId: input.roleId });
  return user.id;
}

async function insertPasskey(userId: string, credentialId: string): Promise<void> {
  await db.insert(passkeys).values({
    userId,
    credentialId,
    publicKey: "key",
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    name: "Llave",
  });
}

async function otherBranch(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the location returned no row");
  }
  return location.id;
}

describe("drizzleBranchUsers", () => {
  describe("branchUsers", () => {
    it("lists the branch's users with their role and passkey count, ordered by first name", async () => {
      const cashier = await insertRole("Cajero");
      const zoe = await insertUser({
        firstName: "Zoe",
        email: "zoe@example.test",
        roleId: cashier,
      });
      const ana = await insertUser({
        firstName: "Ana",
        email: "ana@example.test",
        roleId: await administratorRoleId(),
      });
      await insertPasskey(zoe, "credential-1");
      await insertPasskey(zoe, "credential-2");
      await insertUser({
        firstName: "Eva",
        email: "eva@example.test",
        roleId: cashier,
        locationId: await otherBranch(),
      });

      const listed = await drizzleBranchUsers(db).branchUsers(branch, "any");

      expect(listed).toEqual([
        {
          id: ana,
          firstName: "Ana",
          email: "ana@example.test",
          version: 1,
          active: true,
          roleId: await administratorRoleId(),
          roleName: null,
          roleIsAdministrator: true,
          passkeyCount: 0,
        },
        {
          id: zoe,
          firstName: "Zoe",
          email: "zoe@example.test",
          version: 1,
          active: true,
          roleId: cashier,
          roleName: "Cajero",
          roleIsAdministrator: false,
          passkeyCount: 2,
        },
      ]);
    });

    it("narrows to active or deactivated users by scope", async () => {
      const cashier = await insertRole("Cajero");
      const active = await insertUser({
        firstName: "Ana",
        email: "ana@example.test",
        roleId: cashier,
      });
      const inactive = await insertUser({
        firstName: "Beto",
        email: "beto@example.test",
        roleId: cashier,
        active: false,
      });
      const users = drizzleBranchUsers(db);

      expect((await users.branchUsers(branch, "active")).map((user) => user.id)).toEqual([active]);
      expect((await users.branchUsers(branch, "inactive")).map((user) => user.id)).toEqual([
        inactive,
      ]);
      expect((await users.branchUsers(branch, "any")).map((user) => user.id)).toEqual([
        active,
        inactive,
      ]);
    });
  });

  describe("branchUser", () => {
    it("finds a user of the branch within the scope", async () => {
      const cashier = await insertRole("Cajero");
      const id = await insertUser({ firstName: "Ana", email: "ana@example.test", roleId: cashier });
      await insertPasskey(id, "credential-1");

      const found = await drizzleBranchUsers(db).branchUser(branch, id, "active");

      expect(found).toMatchObject({ id, passkeyCount: 1, roleName: "Cajero" });
    });

    it("finds nobody outside the scope, in another branch, or for a malformed id", async () => {
      const cashier = await insertRole("Cajero");
      const inactive = await insertUser({
        firstName: "Ana",
        email: "ana@example.test",
        roleId: cashier,
        active: false,
      });
      const users = drizzleBranchUsers(db);

      expect(await users.branchUser(branch, inactive, "active")).toBeUndefined();
      expect(await users.branchUser(await otherBranch(), inactive, "any")).toBeUndefined();
      expect(await users.branchUser(branch, "not-a-uuid", "any")).toBeUndefined();
    });
  });

  describe("activeAdministratorCount", () => {
    it("counts the branch's active holders of the Administrator role only", async () => {
      const administrator = await administratorRoleId();
      await insertUser({ firstName: "Ana", email: "ana@example.test", roleId: administrator });
      await insertUser({
        firstName: "Beto",
        email: "beto@example.test",
        roleId: administrator,
        active: false,
      });
      await insertUser({
        firstName: "Eva",
        email: "eva@example.test",
        roleId: administrator,
        locationId: await otherBranch(),
      });
      await insertUser({
        firstName: "Gus",
        email: "gus@example.test",
        roleId: await insertRole("Cajero"),
      });

      expect(await drizzleBranchUsers(db).activeAdministratorCount(branch)).toBe(1);
    });
  });

  describe("emailHolder", () => {
    it("names the user holding the email whatever their branch or state", async () => {
      const elsewhere = await otherBranch();
      const id = await insertUser({
        firstName: "Ana",
        email: "ana@example.test",
        roleId: await insertRole("Cajero"),
        locationId: elsewhere,
        active: false,
      });

      expect(await drizzleBranchUsers(db).emailHolder("ana@example.test")).toEqual({
        id,
        firstName: "Ana",
        active: false,
        locationId: elsewhere,
      });
    });

    it("finds nobody for an email no user holds", async () => {
      expect(await drizzleBranchUsers(db).emailHolder("nadie@example.test")).toBeUndefined();
    });
  });
});

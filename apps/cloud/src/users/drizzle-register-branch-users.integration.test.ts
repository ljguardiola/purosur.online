import { randomUUID } from "node:crypto";
import {
  drizzle,
  type PostgresJsDatabase,
  type PostgresJsQueryResultHKT,
} from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roles, userPins, userRoles, users } from "../platform/db/schema.js";
import {
  insertBranch,
  insertRegister,
  T0,
} from "../register/test-support/restored-register-installations.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRegisterBranchUsers } from "./drizzle-register-branch-users.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let registerBranchUsers: DrizzleRegisterBranchUsers<PostgresJsQueryResultHKT>;
let roleId: string;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_branch_users");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
  registerBranchUsers = new DrizzleRegisterBranchUsers(db);
  const [role] = await db.select({ id: roles.id }).from(roles).limit(1);
  if (!role) {
    throw new Error("test setup: no role seeded");
  }
  roleId = role.id;
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the users of a register's branch", () => {
  async function insertUser(
    locationId: string,
    firstName: string,
    options: { active?: boolean; pin?: { salt: string; hash: string } } = {},
  ): Promise<string> {
    const [user] = await db
      .insert(users)
      .values({
        firstName,
        email: `${randomUUID()}@example.com`,
        locationId,
        active: options.active ?? true,
      })
      .returning({ id: users.id });
    if (!user) {
      throw new Error("test setup: seeding the user returned no row");
    }
    await db.insert(userRoles).values({ userId: user.id, roleId });
    if (options.pin) {
      await db.insert(userPins).values({ userId: user.id, ...options.pin, setAt: T0 });
    }
    return user.id;
  }

  it("holds each user of the branch with the salt and digest of the PIN, and none of another branch", async () => {
    const branchId = await insertBranch(db);
    const registerId = await insertRegister(db, branchId);
    const ana = await insertUser(branchId, "Ana", { pin: { salt: "c2FsdA", hash: "aGFzaA" } });
    const beto = await insertUser(branchId, "Beto", { active: false });
    await insertUser(await insertBranch(db), "Carla", { pin: { salt: "s", hash: "h" } });

    const branchUsers = await registerBranchUsers.branchUsers(registerId);

    expect(branchUsers).toHaveLength(2);
    expect(branchUsers.find(({ userId }) => userId === ana)).toEqual({
      userId: ana,
      firstName: "Ana",
      roleId,
      salt: "c2FsdA",
      pinHash: "aGFzaA",
      active: true,
      version: 1,
    });
    expect(branchUsers.find(({ userId }) => userId === beto)).toEqual({
      userId: beto,
      firstName: "Beto",
      roleId,
      salt: null,
      pinHash: null,
      active: false,
      version: 1,
    });
  });
});

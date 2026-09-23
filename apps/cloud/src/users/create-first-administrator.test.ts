import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../db/build-test-database.js";
import { auditLog, roles, userRoles, users } from "../db/schema.js";
import {
  createFirstAdministrator,
  FirstAdministratorAlreadyBootstrappedError,
  InvalidFirstAdministratorInputError,
} from "./create-first-administrator.js";

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
  const [administratorRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.isAdministrator, true));
  if (!administratorRole) {
    throw new Error("test setup: no Administrator role seeded");
  }
  return administratorRole.id;
}

describe("createFirstAdministrator", () => {
  it("creates one user with the Administrator role and audits the run", async () => {
    const result = await createFirstAdministrator(db, {
      name: "Ada Lovelace",
      email: "ada@example.com",
    });

    expect(result.email).toBe("ada@example.com");

    const createdUsers = await db.select().from(users);
    expect(createdUsers).toHaveLength(1);
    expect(createdUsers[0]).toMatchObject({
      id: result.id,
      firstName: "Ada Lovelace",
      email: "ada@example.com",
      active: true,
    });

    const roleId = await administratorRoleId();
    const createdUserRoles = await db.select().from(userRoles);
    expect(createdUserRoles).toEqual([{ userId: result.id, roleId }]);

    const createdAuditRows = await db.select().from(auditLog);
    expect(createdAuditRows).toHaveLength(1);
    expect(createdAuditRows[0]).toMatchObject({
      entity: "user",
      entityId: result.id,
      actorId: result.id,
      previousValue: null,
      newValue: { firstName: "Ada Lovelace", email: "ada@example.com", roleId },
    });
  });

  it("trims the name and trims and lowercases the email", async () => {
    const result = await createFirstAdministrator(db, {
      name: "  Ada Lovelace  ",
      email: "  ADA@Example.com  ",
    });

    const [createdUser] = await db.select().from(users).where(eq(users.id, result.id));
    expect(createdUser).toMatchObject({ firstName: "Ada Lovelace", email: "ada@example.com" });
  });

  it("refuses a second run and keeps only what the first run created", async () => {
    const first = await createFirstAdministrator(db, {
      name: "Ada Lovelace",
      email: "ada@example.com",
    });

    await expect(
      createFirstAdministrator(db, { name: "Grace Hopper", email: "grace@example.com" }),
    ).rejects.toBeInstanceOf(FirstAdministratorAlreadyBootstrappedError);

    const remainingUsers = await db.select().from(users);
    expect(remainingUsers).toHaveLength(1);
    expect(remainingUsers[0]).toMatchObject({ id: first.id, email: "ada@example.com" });
    await expect(db.select().from(userRoles)).resolves.toEqual([
      { userId: first.id, roleId: await administratorRoleId() },
    ]);
    const auditRows = await db.select().from(auditLog);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ entityId: first.id });
  });

  it("refuses when any user already exists, even one without a role", async () => {
    await db.insert(users).values({ firstName: "Plain Cashier", email: "cashier@example.com" });

    await expect(
      createFirstAdministrator(db, { name: "Ada Lovelace", email: "ada@example.com" }),
    ).rejects.toBeInstanceOf(FirstAdministratorAlreadyBootstrappedError);

    const remainingUsers = await db.select().from(users);
    expect(remainingUsers).toHaveLength(1);
    expect(remainingUsers[0]).toMatchObject({ email: "cashier@example.com" });
    await expect(db.select().from(userRoles)).resolves.toEqual([]);
    await expect(db.select().from(auditLog)).resolves.toEqual([]);
  });

  it("rejects an empty name and creates nothing", async () => {
    await expect(
      createFirstAdministrator(db, { name: "   ", email: "ada@example.com" }),
    ).rejects.toBeInstanceOf(InvalidFirstAdministratorInputError);

    await expect(db.select().from(users)).resolves.toEqual([]);
  });

  it("rejects an email with no @ and creates nothing", async () => {
    await expect(
      createFirstAdministrator(db, { name: "Ada Lovelace", email: "not-an-email" }),
    ).rejects.toBeInstanceOf(InvalidFirstAdministratorInputError);

    await expect(db.select().from(users)).resolves.toEqual([]);
  });

  it("rejects an email containing spaces and creates nothing", async () => {
    await expect(
      createFirstAdministrator(db, { name: "Ada Lovelace", email: "ada lovelace@example.com" }),
    ).rejects.toBeInstanceOf(InvalidFirstAdministratorInputError);

    await expect(db.select().from(users)).resolves.toEqual([]);
  });

  it.each([
    ["an empty name", { name: "   ", email: "ada@example.com" }],
    ["a malformed email", { name: "Ada Lovelace", email: "not-an-email" }],
  ])("rejects %s without opening a transaction", async (_, input) => {
    const transaction = vi.spyOn(db, "transaction");
    onTestFinished(() => transaction.mockRestore());

    await expect(createFirstAdministrator(db, input)).rejects.toBeInstanceOf(
      InvalidFirstAdministratorInputError,
    );

    expect(transaction).not.toHaveBeenCalled();
  });

  it("seeds exactly one Administrator role in the migrations", async () => {
    const administratorRoles = await db.select().from(roles).where(eq(roles.isAdministrator, true));

    expect(administratorRoles).toHaveLength(1);
    expect(administratorRoles[0]).toMatchObject({ name: null, isAdministrator: true });
  });

  it("rejects a role that is not the Administrator unless it has a name", async () => {
    await expect(
      db.execute(sql`insert into roles (is_administrator) values (false)`),
    ).rejects.toMatchObject({ cause: { constraint: "roles_name_unless_administrator" } });
    await expect(
      db.execute(sql`insert into roles (name, is_administrator) values ('Cashier', false)`),
    ).resolves.toBeDefined();
  });

  it("rejects an Administrator role that carries a name", async () => {
    await db.execute(sql`delete from roles where is_administrator`);

    await expect(
      db.execute(sql`insert into roles (name, is_administrator) values ('Impostor', true)`),
    ).rejects.toMatchObject({ cause: { constraint: "roles_name_unless_administrator" } });
  });

  it("rejects a second Administrator role", async () => {
    await expect(
      db.execute(sql`insert into roles (is_administrator) values (true)`),
    ).rejects.toMatchObject({ cause: { constraint: "roles_single_administrator_key" } });
  });
});

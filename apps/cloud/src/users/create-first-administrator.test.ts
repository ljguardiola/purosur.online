import { PGlite } from "@electric-sql/pglite";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, roles, userRoles, users } from "../db/schema.js";
import {
  createFirstAdministrator,
  FirstAdministratorAlreadyBootstrappedError,
  InvalidFirstAdministratorInputError,
} from "./create-first-administrator.js";

const MIGRATIONS_FOLDER = new URL("../../migrations", import.meta.url).pathname;

let client: PGlite;
let db: PgliteDatabase<Record<string, never>>;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(async () => {
  await client.close();
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
      newValue: { firstName: "Ada Lovelace", email: "ada@example.com", role: "administrator" },
    });
  });

  it("normalizes the email by trimming and lowercasing it", async () => {
    const result = await createFirstAdministrator(db, {
      name: "  Ada Lovelace  ",
      email: "  ADA@Example.com  ",
    });

    const [createdUser] = await db.select().from(users).where(eq(users.id, result.id));
    expect(createdUser).toMatchObject({ firstName: "Ada Lovelace", email: "ada@example.com" });
  });

  it("refuses when a user already exists and leaves the database unchanged", async () => {
    const roleId = await administratorRoleId();
    await db.insert(users).values({ firstName: "Existing Person", email: "existing@example.com" });

    await expect(
      createFirstAdministrator(db, { name: "Ada Lovelace", email: "ada@example.com" }),
    ).rejects.toBeInstanceOf(FirstAdministratorAlreadyBootstrappedError);

    const remainingUsers = await db.select().from(users);
    expect(remainingUsers).toHaveLength(1);
    expect(remainingUsers[0]).toMatchObject({ email: "existing@example.com" });
    await expect(db.select().from(userRoles)).resolves.toEqual([]);
    await expect(db.select().from(auditLog)).resolves.toEqual([]);
    // The existing user was not the Administrator: its role membership is untouched by the refusal.
    expect(roleId).toBeTruthy();
  });

  it("refuses when the only existing user is not the Administrator", async () => {
    await db.insert(users).values({ firstName: "Plain Cashier", email: "cashier@example.com" });

    await expect(
      createFirstAdministrator(db, { name: "Ada Lovelace", email: "ada@example.com" }),
    ).rejects.toBeInstanceOf(FirstAdministratorAlreadyBootstrappedError);

    await expect(db.select().from(users)).resolves.toHaveLength(1);
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

  it("seeds exactly one Administrator role in the migrations", async () => {
    const administratorRoles = await db
      .select()
      .from(roles)
      .where(eq(roles.isAdministrator, true))
      .orderBy(asc(roles.name));

    expect(administratorRoles).toHaveLength(1);
    expect(administratorRoles[0]).toMatchObject({ name: "Administrador", isAdministrator: true });
  });

  it("keeps the migration from ever seeding a second Administrator role", async () => {
    await expect(
      db.execute(sql`insert into roles (name, is_administrator) values ('Impostor', true)`),
    ).rejects.toThrow();
  });
});

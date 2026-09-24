import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, roles, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { editRole } from "./role-edit-route.js";

// PGlite runs every query over one connection, so it can never race two edits for the same role or
// the same name. This runs them over a real postgres-js pool of more than one connection against a
// real Postgres, the same reasoning `role-name-uniqueness.integration.test.ts` gives for creation.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("role_edit");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function insertAdministrator(suffix: string): Promise<string> {
  const [administrator] = await db
    .insert(users)
    .values({
      firstName: "Ada Lovelace",
      email: `ada-${suffix}@example.com`,
      locationId: await seededLocationId(db),
    })
    .returning({ id: users.id });
  if (!administrator) {
    throw new Error("test setup: seeding the administrator returned no row");
  }
  return administrator.id;
}

async function insertRole(name: string): Promise<string> {
  const [role] = await db.insert(roles).values({ name, isAdministrator: false }).returning({
    id: roles.id,
  });
  if (!role) {
    throw new Error("test setup: seeding the role returned no row");
  }
  return role.id;
}

describe("two edits racing on the same role's version, on a real Postgres through postgres-js", () => {
  it("applies exactly one of them and reports the other as stale_version", async () => {
    const suffix = randomUUID();
    const administratorId = await insertAdministrator(suffix);
    const locationId = await seededLocationId(db);
    const roleId = await insertRole(`Cajera ${suffix}`);

    const [first, second] = await Promise.all([
      editRole(db, {
        id: roleId,
        name: `Primera ${suffix}`,
        permissionKeys: ["sell_and_charge"],
        version: 1,
        actorId: administratorId,
        locationId,
      }),
      editRole(db, {
        id: roleId,
        name: `Segunda ${suffix}`,
        permissionKeys: ["adjust_stock"],
        version: 1,
        actorId: administratorId,
        locationId,
      }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.kind === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "stale_version")).toHaveLength(1);

    const [row] = await db.select().from(roles).where(eq(roles.id, roleId));
    expect(row).toMatchObject({ version: 2 });

    const winner = outcomes.find((outcome) => outcome.kind === "applied");
    if (winner?.kind !== "applied") {
      throw new Error("test setup: expected one edit to have won the race");
    }
    expect(row?.name).toBe(winner.role.name);

    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "role"));
    expect(audited.filter((entry) => entry.entityId === roleId)).toHaveLength(1);
  });
});

describe("two edits racing to rename different roles to the same name, on a real Postgres through postgres-js", () => {
  it("applies exactly one of them and reports the other as name_taken", async () => {
    const suffix = randomUUID();
    const administratorId = await insertAdministrator(suffix);
    const locationId = await seededLocationId(db);
    const roleAId = await insertRole(`Original A ${suffix}`);
    const roleBId = await insertRole(`Original B ${suffix}`);
    const targetName = `Compartido ${suffix}`;

    const [first, second] = await Promise.all([
      editRole(db, {
        id: roleAId,
        name: targetName,
        permissionKeys: [],
        version: 1,
        actorId: administratorId,
        locationId,
      }),
      editRole(db, {
        id: roleBId,
        name: targetName.toUpperCase(),
        permissionKeys: [],
        version: 1,
        actorId: administratorId,
        locationId,
      }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.kind === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);

    const renamed = await db
      .select()
      .from(roles)
      .where(inArray(roles.id, [roleAId, roleBId]));
    const matchingName = renamed.filter(
      (role) => role.name?.toLowerCase() === targetName.toLowerCase(),
    );
    expect(matchingName).toHaveLength(1);
  });
});

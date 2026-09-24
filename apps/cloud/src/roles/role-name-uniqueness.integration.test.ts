import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, roles, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { createRole } from "./role-creation-route.js";

// PGlite runs every query over one connection, so it can never race two creations for the same
// name. This runs them over a real postgres-js pool of more than one connection against a real
// Postgres, so the name each one races for is caught either by the transaction's own
// case-insensitive check or, when both slip past it concurrently, by the database's unique index
// on `lower(roles.name)` — reported as `constraint_name` by postgres-js, unlike PGlite's
// `constraint`, which is what `isRoleNameUniqueViolation` (in `role-creation-route.ts`) must map
// correctly for this driver too.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("role_name_uniqueness");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("creating two roles with the same name concurrently on a real Postgres through postgres-js", () => {
  it("creates exactly one of them and reports the other as name_taken, auditing only the winner", async () => {
    const suffix = randomUUID();
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
    const administratorId = administrator.id;
    const name = `Cajera ${suffix}`;

    const [first, second] = await Promise.all([
      createRole(db, { name, permissionKeys: ["sell_and_charge"], actorId: administratorId }),
      createRole(db, {
        name: name.toUpperCase(),
        permissionKeys: ["sell_and_charge"],
        actorId: administratorId,
      }),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.kind === "created")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);

    const matchingRoles = await db.select().from(roles).where(eq(roles.isAdministrator, false));
    expect(matchingRoles).toHaveLength(1);

    const winner = outcomes.find((outcome) => outcome.kind === "created");
    if (winner?.kind !== "created") {
      throw new Error("test setup: expected one creation to have won the race");
    }
    const audited = await db.select().from(auditLog).where(eq(auditLog.entity, "role"));
    expect(audited).toHaveLength(1);
    expect(audited[0]).toMatchObject({ entityId: winner.role.id, actorId: administratorId });
  });
});

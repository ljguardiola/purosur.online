import { randomUUID } from "node:crypto";
import { createRegister } from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registers, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBranchRegisterStore } from "./drizzle-branch-register-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

// PGlite can't race two creations for the same name; this runs them on a real postgres-js pool,
// whose driver reports the violated index as `constraint_name` rather than PGlite's `constraint`.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_name_uniqueness");
  sql = postgres(integrationDb.databaseUrl, { max: 2 });
  // Only the schema's owner may LOCK TABLE; the creations themselves still run as `cloud_app`.
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("creating two registers with the same name in the same branch concurrently on a real Postgres through postgres-js", () => {
  it("creates exactly one of them and reports the other as name_taken", async () => {
    const suffix = randomUUID();
    const locationId = await seededLocationId(db);
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada Lovelace", email: `ada-${suffix}@example.com`, locationId })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("test setup: seeding the actor returned no row");
    }
    const name = `Caja ${suffix}`;

    // A SHARE lock lets both name-uniqueness SELECTs run (ACCESS SHARE, compatible) but parks both
    // INSERTs (ROW EXCLUSIVE, incompatible); one commits, and the other then collides on the
    // database's unique index rather than the in-transaction check.
    const holder = await adminSql.reserve();
    let creations: ReturnType<typeof createRegister>[] = [];
    try {
      await holder`begin`;
      await holder`lock table registers in share mode`;
      creations = [
        createRegister(new DrizzleBranchRegisterStore(db, () => NOON), {
          locationId,
          name,
          actorId: actor.id,
        }),
        createRegister(new DrizzleBranchRegisterStore(db, () => NOON), {
          locationId,
          name: name.toUpperCase(),
          actorId: actor.id,
        }),
      ];
      await waitForLockWaiters(adminSql, 2);
    } finally {
      await holder`rollback`;
      holder.release();
    }

    const outcomes = await Promise.all(creations);
    expect(outcomes.filter((outcome) => outcome.kind === "created")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "name_taken")).toHaveLength(1);

    const winner = outcomes.find((outcome) => outcome.kind === "created");
    if (winner?.kind !== "created") {
      throw new Error("test setup: expected one creation to have won the race");
    }
    const matchingRegisters = await db
      .select()
      .from(registers)
      .where(eq(registers.name, winner.register.name));
    expect(matchingRegisters).toHaveLength(1);
  });
});

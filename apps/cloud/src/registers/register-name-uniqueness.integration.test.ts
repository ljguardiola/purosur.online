import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registers, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { createRegister } from "./register-creation-route.js";

// PGlite runs every query over one connection, so it can never race two creations for the same
// name. This runs them over a real postgres-js pool of more than one connection against a real
// Postgres, so the name each one races for is caught either by the transaction's own
// case-insensitive check or, when both slip past it concurrently, by the database's unique index on
// `(location_id, lower(name))` — reported as `constraint_name` by postgres-js, unlike PGlite's
// `constraint`, which is what `isRegisterNameUniqueViolation` (in `register-creation-route.ts`)
// must map correctly for this driver too.
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

async function waitForLockWaiters(count: number): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [row] = await adminSql<{ waiting: number }[]>`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'`;
    if ((row?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("test setup: the creations never queued behind the held lock");
}

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

    // A SHARE lock on the registers table lets both creations' own name-uniqueness SELECT run and
    // find no row (SELECT only needs ACCESS SHARE, compatible with SHARE), but parks both at their
    // INSERT (which needs ROW EXCLUSIVE, incompatible with SHARE) until the lock is released. Both
    // then race the real INSERT: one commits, and the other's insert always collides with the
    // now-committed row on the database's own unique index, never on the in-transaction check, which
    // both already passed before either could commit.
    const holder = await adminSql.reserve();
    let creations: ReturnType<typeof createRegister>[] = [];
    try {
      await holder`begin`;
      await holder`lock table registers in share mode`;
      creations = [
        createRegister(db, { locationId, name, actorId: actor.id }),
        createRegister(db, { locationId, name: name.toUpperCase(), actorId: actor.id }),
      ];
      await waitForLockWaiters(2);
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

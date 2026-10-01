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

const UNIQUE_VIOLATION = "23505";

// PGlite serializes every query on one connection, so where a lock is taken can only be observed
// against a real Postgres pool.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_change_log_order");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("creating a register while another writer holds the change log, on a real Postgres", () => {
  it("has already written the register's row when the creation starts waiting for the log", async () => {
    const locationId = await seededLocationId(db);
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada", email: `ada-${randomUUID()}@example.com`, locationId })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("test setup: seeding the actor returned no row");
    }
    const name = `Caja ${randomUUID()}`;

    const holder = await sql.reserve();
    await holder`begin`;
    await holder`select pg_advisory_xact_lock(hashtextextended('changes_log', 0))`;
    const creation = createRegister(new DrizzleBranchRegisterStore(db), {
      locationId,
      name,
      actorId: actor.id,
    });
    let claim: Promise<unknown> = Promise.resolve();
    try {
      await waitForLockWaiters(sql, 1);
      claim = sql`insert into registers (location_id, name) values (${locationId}, ${name})`.then(
        () => undefined,
        (error: { code?: string }) => error.code,
      );
      await waitForLockWaiters(sql, 2);
    } finally {
      await holder`rollback`;
      holder.release();
    }

    await expect(creation).resolves.toMatchObject({ kind: "created" });
    await expect(claim).resolves.toBe(UNIQUE_VIOLATION);
    const stored = await db
      .select({ name: registers.name })
      .from(registers)
      .where(eq(registers.name, name));
    expect(stored).toEqual([{ name }]);
  });
});

import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, registerEnrollmentCodes, registers, users } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { emitRegisterEnrollmentCode } from "./register-enrollment-code-route.js";

// PGlite runs every query over one connection, so it can never race two emissions for the same
// register. This runs them over a real postgres-js pool of more than one connection against a real
// Postgres.
let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_enrollment_code_concurrency");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  // Only the schema's owner may LOCK TABLE; the emissions themselves still run as `cloud_app`.
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
  throw new Error("test setup: the emissions never queued behind the held lock");
}

describe("emitting two enrollment codes for a register with no code yet concurrently on a real Postgres through postgres-js", () => {
  it("audits the first as replacing nothing and the second as replacing the first, keeping the last one's code", async () => {
    const suffix = randomUUID();
    const locationId = await seededLocationId(db);
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada Lovelace", email: `ada-${suffix}@example.com`, locationId })
      .returning({ id: users.id });
    const [register] = await db
      .insert(registers)
      .values({ locationId, name: `Caja ${suffix}` })
      .returning({ id: registers.id });
    if (!actor || !register) {
      throw new Error("test setup: seeding the actor or the register returned no row");
    }
    const firstNow = new Date();
    const secondNow = new Date(firstNow.getTime() + 1_000);

    // A SHARE lock on the codes table parks the first emission at its INSERT, after it has locked
    // the register row and found no code row; the second then waits on that register row and only
    // reads the codes table once the first commits, so it sees the first code as the one replaced.
    // Without the register-row lock nothing would stop the second, and both would read no row.
    const holder = await adminSql.reserve();
    let emissions: ReturnType<typeof emitRegisterEnrollmentCode>[] = [];
    try {
      await holder`begin`;
      await holder`lock table register_enrollment_codes in share mode`;
      emissions = [
        emitRegisterEnrollmentCode(db, {
          registerId: register.id,
          actorId: actor.id,
          now: firstNow,
        }),
        emitRegisterEnrollmentCode(db, {
          registerId: register.id,
          actorId: actor.id,
          now: secondNow,
        }),
      ];
      await waitForLockWaiters(2);
    } finally {
      await holder`rollback`;
      holder.release();
    }
    const emitted = await Promise.all(emissions);

    const entries = await db.select().from(auditLog).where(eq(auditLog.entityId, register.id));
    expect(entries).toHaveLength(2);
    const replacingNothing = entries.filter((entry) => entry.previousValue === null);
    const replacingOne = entries.filter((entry) => entry.previousValue !== null);
    expect(replacingNothing).toHaveLength(1);
    expect(replacingOne).toHaveLength(1);
    expect(replacingOne[0]?.previousValue).toEqual(replacingNothing[0]?.newValue);

    const lastAudited = replacingOne[0]?.newValue as { expires_at: string } | undefined;
    const last = emitted.find(
      (emission) => emission.expiresAt.toISOString() === lastAudited?.expires_at,
    );
    const [stored] = await db
      .select()
      .from(registerEnrollmentCodes)
      .where(eq(registerEnrollmentCodes.registerId, register.id));
    expect(last).toBeDefined();
    expect(stored?.codeHash).toBe(
      createHash("sha256")
        .update(last?.code ?? "")
        .digest("base64url"),
    );
  });
});

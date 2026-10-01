import { createHash, randomUUID } from "node:crypto";
import { emitEnrollmentCode } from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLog, registerEnrollmentCodes, registers, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBranchRegisterStore } from "./drizzle-branch-register-store.js";
import { secretEnrollmentCodes } from "./register-enrollment-code.js";

// PGlite runs every query over one connection, so it can never race two emissions for the same
// register; this runs them over a real multi-connection postgres-js pool instead.
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

function emitAt(locationId: string, registerId: string, actorId: string, now: Date) {
  return emitEnrollmentCode(
    {
      store: new DrizzleBranchRegisterStore(db),
      clock: { now: () => now },
      codes: secretEnrollmentCodes,
    },
    { locationId, registerId, actorId },
  );
}

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

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

    // A SHARE lock on the codes table parks the first emission at its INSERT after it has locked
    // the register row, so the second waits on that row and sees the first's code as replaced only
    // once it commits.
    const holder = await adminSql.reserve();
    let emissions: ReturnType<typeof emitAt>[] = [];
    try {
      await holder`begin`;
      await holder`lock table register_enrollment_codes in share mode`;
      emissions = [
        emitAt(locationId, register.id, actor.id, firstNow),
        emitAt(locationId, register.id, actor.id, secondNow),
      ];
      await waitForLockWaiters(adminSql, 2);
    } finally {
      await holder`rollback`;
      holder.release();
    }
    const emitted = (await Promise.all(emissions)).flatMap((outcome) =>
      outcome.kind === "emitted" ? [outcome] : [],
    );
    expect(emitted).toHaveLength(2);

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

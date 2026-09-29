import { randomUUID } from "node:crypto";
import { enrollInstallation } from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  registerEnrollmentCodes,
  registerInstallations,
  registers,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { runQueuedBehindHeldLock } from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { issueDeviceToken } from "./device-token.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import {
  hashRegisterEnrollmentCode,
  registerEnrollmentCodeMatches,
} from "./register-enrollment-code.js";

// PGlite runs every query over one connection, so it can never race two redemptions of the same
// code; this runs them over a real multi-connection postgres-js pool instead.
const CODE = "P4NX7KWE2QRT6MZD";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("device_enrollment_race");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function enroll(hostname: string) {
  const now = new Date();
  return enrollInstallation(
    {
      store: new DrizzleRegisterStore(db),
      clock: { now: () => now },
      tokens: { issue: issueDeviceToken },
      codes: { matches: registerEnrollmentCodeMatches },
    },
    { code: CODE, sourceAddress: `203.0.113.${hostname.length}`, hostname, windowsVersion: "11" },
  );
}

describe("redeeming the same enrollment code twice at once on a real Postgres through postgres-js", () => {
  it("enrolls exactly one installation and refuses the other", async () => {
    const [register] = await db
      .insert(registers)
      .values({ locationId: await seededLocationId(db), name: `Caja ${randomUUID()}` })
      .returning({ id: registers.id });
    if (!register) {
      throw new Error("test setup: seeding the register returned no row");
    }
    const issuedAt = new Date();
    await db.insert(registerEnrollmentCodes).values({
      registerId: register.id,
      codeLookup: CODE.slice(0, 4),
      codeHash: hashRegisterEnrollmentCode(CODE),
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000),
    });

    const outcomes = await runQueuedBehindHeldLock(
      sql,
      (holder) =>
        holder`select 1 from register_enrollment_codes where register_id = ${register.id} for update`,
      () => enroll("PRIMERA"),
      () => enroll("SEGUNDA-CAJA"),
    );

    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(["code_rejected", "enrolled"]);
    const installations = await db
      .select({ revokedAt: registerInstallations.revokedAt })
      .from(registerInstallations)
      .where(eq(registerInstallations.registerId, register.id));
    expect(installations).toEqual([{ revokedAt: null }]);
  });
});

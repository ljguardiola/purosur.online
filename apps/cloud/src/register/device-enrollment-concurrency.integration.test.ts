import { randomUUID } from "node:crypto";
import { emitEnrollmentCode, enrollInstallation } from "@purosur/domain/register/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  registerEnrollmentCodes,
  registerInstallations,
  registers,
  users,
} from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  runQueuedBehindHeldLock,
  waitForLockWaiters,
} from "../test-support/queued-behind-held-lock.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { issueDeviceToken } from "./device-token.js";
import { DrizzleBranchRegisterStore } from "./drizzle-branch-register-store.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import { generateInstallationKey } from "./installation-key.js";
import { installationKeyCipher } from "./installation-key-cipher.js";
import {
  registerEnrollmentCodeMatches,
  secretEnrollmentCodes,
} from "./register-enrollment-code.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

// PGlite runs every query over one connection, so it can never race two redemptions of the same
// code; this runs them over a real multi-connection postgres-js pool instead.
const CODE = "P4NX7KWE2QRT6MZD";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let adminSql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("device_enrollment_race");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  // Only the schema's owner may LOCK TABLE; enrolling and emitting still run as `cloud_app`.
  adminSql = postgres(integrationDb.adminDatabaseUrl, { max: 2 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await adminSql.end({ timeout: 1 });
  await integrationDb.close();
});

function enroll(hostname: string) {
  const now = new Date();
  return enrollInstallation(
    {
      store: new DrizzleRegisterStore(
        db,
        installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
      ),
      clock: { now: () => now },
      tokens: { issue: issueDeviceToken },
      codes: { matches: registerEnrollmentCodeMatches },
      keys: { generate: generateInstallationKey },
    },
    { code: CODE, sourceAddress: `203.0.113.${hostname.length}`, hostname, windowsVersion: "11" },
  );
}

async function insertRegisterWithCode(): Promise<string> {
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
    codeHash: hashSecretCode(CODE),
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000),
  });
  return register.id;
}

describe("emitting a new code while the current one is being redeemed, on a real Postgres", () => {
  it("lets both finish instead of deadlocking on the register row", async () => {
    await db.delete(registerEnrollmentCodes);
    const registerId = await insertRegisterWithCode();
    const locationId = await seededLocationId(db);
    const [actor] = await db
      .insert(users)
      .values({
        firstName: "Ada Lucero",
        email: `ada-${randomUUID()}@example.com`,
        locationId,
      })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("test setup: seeding the actor returned no row");
    }

    // A SHARE lock on the installations table parks the enrollment after it has locked the code
    // row; the emission then locks the register row and queues behind the code row, so releasing
    // the table lets the enrollment's installation insert check its foreign key on that register.
    const holder = await adminSql.reserve();
    let enrollment: ReturnType<typeof enroll> | undefined;
    let emission: Promise<unknown> | undefined;
    try {
      await holder`begin`;
      await holder`lock table register_installations in share mode`;
      enrollment = enroll("PRIMERA");
      await waitForLockWaiters(adminSql, 1);
      emission = emitEnrollmentCode(
        {
          store: new DrizzleBranchRegisterStore(db, () => NOON),
          clock: { now: () => new Date() },
          codes: secretEnrollmentCodes,
        },
        { locationId, registerId, actorId: actor.id },
      );
      await waitForLockWaiters(adminSql, 2);
    } finally {
      await holder`rollback`;
      holder.release();
    }

    await expect(enrollment).resolves.toMatchObject({ kind: "enrolled", registerId });
    await expect(emission).resolves.toMatchObject({ kind: "emitted", code: expect.any(String) });
  });
});

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
      codeHash: hashSecretCode(CODE),
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

import {
  enrollInstallation,
  type RegisterStore,
  type RegisterStoreTransaction,
} from "@purosur/domain/installation/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DrizzleNumberingConflictLanes } from "../fiscal/drizzle-numbering-conflict-lanes.js";
import { DrizzleTaxAuthorityCounts } from "../fiscal/drizzle-tax-authority-counts.js";
import { enqueueNumberingReconciliationJob } from "../fiscal/graphile-numbering-conflict-queue.js";
import { RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER } from "../fiscal/numbering-conflict-task.js";
import { insertRegisterWithPointOfSale } from "../fiscal/test-support/authorization-request-fixtures.js";
import {
  numberingFreezes,
  registerEnrollmentCodes,
  taxAuthorityLastAuthorizedNumbers,
} from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import { installationKeyCipher } from "../platform/installation-key-cipher.js";
import { hashSecretCode } from "../platform/secret-code.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { issueDeviceToken } from "./device-token.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import { generateInstallationKey } from "./installation-key.js";
import { registerEnrollmentCodeMatches } from "./register-enrollment-code.js";

const ENROLLED_AT = new Date("2026-10-06T15:00:00.000Z");
const EARLIER_FREEZE = new Date("2026-10-05T09:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;
let enqueuedReconciliations: number[];

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_store_numbering");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function recordingEnqueue() {
  enqueuedReconciliations = [];
  return async (_transaction: unknown, pointOfSale: number) => {
    enqueuedReconciliations.push(pointOfSale);
  };
}

function registerStore(database: PostgresJsDatabase<Record<string, never>> = db) {
  return new DrizzleRegisterStore(
    database,
    installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
    async () => {},
    recordingEnqueue(),
  );
}

function freezeRestoredRegister(registerId: string, store: RegisterStore = registerStore()) {
  return store.transaction((tx) => tx.freezeRestoredRegisterNumbering(registerId, ENROLLED_AT));
}

async function freezeOf(pointOfSale: number) {
  const [row] = await db
    .select({
      countBeforeFreeze: numberingFreezes.countBeforeFreeze,
      frozenAt: numberingFreezes.frozenAt,
    })
    .from(numberingFreezes)
    .where(eq(numberingFreezes.pointOfSaleNumber, pointOfSale));
  return row;
}

async function holdCount(pointOfSale: number, lastAuthorized: number) {
  await db.insert(taxAuthorityLastAuthorizedNumbers).values({
    pointOfSaleNumber: pointOfSale,
    documentType: "factura_c",
    lastAuthorized,
    readAt: ENROLLED_AT,
  });
}

describe("reconciling a register's real-time numbering on a real Postgres", () => {
  it("freezes nothing and enqueues nothing when the cloud holds no count of the point of sale", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 53,
      name: "caja-53",
    });

    await freezeRestoredRegister(registerId);

    expect(await freezeOf(53)).toBeUndefined();
    expect(enqueuedReconciliations).toEqual([]);
  });

  it("freezes nothing for a register without a real-time point of sale", async () => {
    await freezeRestoredRegister(crypto.randomUUID());

    expect(enqueuedReconciliations).toEqual([]);
  });

  it("freezes nothing when invoicing is not configured, so nothing reconciles its numbering", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 59,
      name: "caja-59",
    });
    await holdCount(59, 3);
    const store = new DrizzleRegisterStore(
      db,
      installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
    );

    await freezeRestoredRegister(registerId, store);

    expect(await freezeOf(59)).toBeUndefined();
  });

  it("keeps the count of the real-time point of sale held when a fresh count is required, so the next enrollment freezes it again", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 60,
      name: "caja-60",
    });
    await holdCount(60, 31);

    await registerStore().transaction((tx) => tx.requireFreshTaxAuthorityCount(registerId));
    await freezeRestoredRegister(registerId);

    expect(await freezeOf(60)).toEqual({ countBeforeFreeze: 31, frozenAt: ENROLLED_AT });
  });

  it("freezes the point of sale, tells the register that holds it and enqueues the reconciliation", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 52,
      name: "caja-52",
    });
    await holdCount(52, 25);
    const before = await lastLoggedChangeSeq(db);

    await freezeRestoredRegister(registerId);

    expect(await freezeOf(52)).toEqual({ countBeforeFreeze: 25, frozenAt: ENROLLED_AT });
    expect(enqueuedReconciliations).toEqual([52]);
    expect(await changesLoggedAfter(db, before)).toEqual([
      expect.objectContaining({ entity: "register_point_of_sale", entityId: registerId }),
    ]);
  });

  it("enqueues the real reconciliation job with the freeze and none when the enrollment rolls back", async () => {
    const frozenRegisterId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 61,
      name: "caja-61",
    });
    const rolledBackRegisterId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 57,
      name: "caja-57",
    });
    await holdCount(61, 7);
    await holdCount(57, 7);
    const store = new DrizzleRegisterStore(
      db,
      installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
      undefined,
      enqueueNumberingReconciliationJob,
    );

    await freezeRestoredRegister(frozenRegisterId, store);
    await expect(
      store.transaction(async (tx) => {
        await tx.freezeRestoredRegisterNumbering(rolledBackRegisterId, ENROLLED_AT);
        throw new Error("the enrollment failed after freezing");
      }),
    ).rejects.toThrow("the enrollment failed");

    const jobs = await sql<{ pointOfSale: number }[]>`
      select (j.payload->>'pointOfSale')::int as "pointOfSale"
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = ${RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER}`;
    expect(jobs).toEqual([{ pointOfSale: 61 }]);
    expect(await freezeOf(57)).toBeUndefined();
  });

  it("keeps the range of a freeze already in place", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 54,
      name: "caja-54",
    });
    await holdCount(54, 40);
    await db
      .insert(numberingFreezes)
      .values({ pointOfSaleNumber: 54, countBeforeFreeze: 12, frozenAt: EARLIER_FREEZE });

    await freezeRestoredRegister(registerId);

    expect(await freezeOf(54)).toEqual({ countBeforeFreeze: 12, frozenAt: EARLIER_FREEZE });
  });

  it("waits for a numbering diagnosis running on the same point of sale before it freezes it", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 56,
      name: "caja-56",
    });
    await holdCount(56, 30);
    const lanes = new DrizzleNumberingConflictLanes(
      postgresDedicatedConnections(sql),
      async () => {},
      async () => {},
      () => ENROLLED_AT,
    );
    let endDiagnosis: () => void = () => {};
    const diagnosisMayEnd = new Promise<void>((resolve) => {
      endDiagnosis = resolve;
    });
    let diagnosisHoldsLane: () => void = () => {};
    const laneHeld = new Promise<void>((resolve) => {
      diagnosisHoldsLane = resolve;
    });
    const diagnosis = lanes.inPointOfSaleLane(56, async () => {
      diagnosisHoldsLane();
      await diagnosisMayEnd;
    });
    await laneHeld;
    const enrolling = postgres(integrationDb.databaseUrl, {
      max: 1,
      connection: { application_name: "enrolling-register" },
    });

    try {
      let taken = false;
      const enrollment = registerStore(drizzle(enrolling))
        .transaction((tx) => tx.freezeRestoredRegisterNumbering(registerId, ENROLLED_AT))
        .then(() => {
          taken = true;
        });
      await vi.waitFor(async () => {
        const waiting = await sql`
          select 1 from pg_locks
          join pg_stat_activity using (pid)
          where pg_stat_activity.datname = current_database()
            and application_name = 'enrolling-register'
            and locktype = 'advisory'
            and not granted`;
        expect(waiting).toHaveLength(1);
      });
      expect(taken).toBe(false);

      endDiagnosis();
      await diagnosis;

      await enrollment;
      expect(await freezeOf(56)).toEqual({ countBeforeFreeze: 30, frozenAt: ENROLLED_AT });
    } finally {
      await enrolling.end({ timeout: 1 });
    }
  });

  it("enrolls while the tax authority's count of the same point of sale advances, without either one deadlocking", async () => {
    const code = "W3RT6MZDP4NX7KWE";
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 58,
      name: "caja-58",
    });
    await holdCount(58, 25);
    await db.insert(registerEnrollmentCodes).values({
      registerId,
      codeLookup: code.slice(0, 4),
      codeHash: hashSecretCode(code),
      issuedAt: EARLIER_FREEZE,
      expiresAt: new Date(ENROLLED_AT.getTime() + 10 * 60_000),
    });
    const counting = postgres(integrationDb.databaseUrl, {
      max: 1,
      connection: { application_name: "count-advancing" },
    });
    let advanced = false;
    let advanceFailure: unknown;
    let advance: Promise<void> = Promise.resolve();
    const store = new DrizzleRegisterStore(
      db,
      installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
      async () => {},
      recordingEnqueue(),
    );
    const advancingBeforeTheFreshCount: RegisterStore = {
      transaction: (work) =>
        store.transaction((tx) =>
          work(
            new Proxy(tx, {
              get(target, operation: keyof RegisterStoreTransaction) {
                if (operation !== "requireFreshTaxAuthorityCount") {
                  return target[operation].bind(target);
                }
                return async (enrolledRegisterId: string) => {
                  advance = new DrizzleTaxAuthorityCounts(drizzle(counting))
                    .advance({
                      pointOfSale: 58,
                      documentType: "factura_c",
                      lastAuthorized: 26,
                      readAt: ENROLLED_AT,
                    })
                    .then(
                      () => {
                        advanced = true;
                      },
                      (error: unknown) => {
                        advanceFailure = error;
                      },
                    );
                  await vi.waitFor(async () => {
                    const [waiting] = await sql`
                      select 1 from pg_stat_activity
                      where datname = current_database()
                        and application_name = 'count-advancing'
                        and wait_event_type = 'Lock'`;
                    expect(advanced || advanceFailure !== undefined || waiting !== undefined).toBe(
                      true,
                    );
                  });
                  await target.requireFreshTaxAuthorityCount(enrolledRegisterId);
                };
              },
            }),
          ),
        ),
    };

    try {
      const [enrollment] = await Promise.allSettled([
        enrollInstallation(
          {
            store: advancingBeforeTheFreshCount,
            clock: { now: () => ENROLLED_AT },
            tokens: { issue: issueDeviceToken },
            codes: { matches: registerEnrollmentCodeMatches },
            keys: { generate: generateInstallationKey },
          },
          { code, sourceAddress: "192.0.2.58", hostname: "CAJA-58", windowsVersion: "11" },
        ),
      ]);
      await advance;

      expect(enrollment).toMatchObject({ status: "fulfilled", value: { kind: "enrolled" } });
      expect(advanceFailure).toBeUndefined();
      expect(advanced).toBe(true);
      expect(await freezeOf(58)).toEqual({ countBeforeFreeze: 25, frozenAt: ENROLLED_AT });
    } finally {
      await counting.end({ timeout: 1 });
    }
  });
});

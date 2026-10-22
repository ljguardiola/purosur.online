import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DrizzleNumberingConflictLanes } from "../fiscal/drizzle-numbering-conflict-lanes.js";
import { enqueueNumberingReconciliationJob } from "../fiscal/graphile-numbering-conflict-queue.js";
import { RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER } from "../fiscal/numbering-conflict-task.js";
import { insertRegisterWithPointOfSale } from "../fiscal/test-support/authorization-request-fixtures.js";
import { numberingFreezes, taxAuthorityLastAuthorizedNumbers } from "../platform/db/schema.js";
import { postgresDedicatedConnections } from "../platform/dedicated-connections.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../test-support/installation-keys-encryption-key.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import { installationKeyCipher } from "./installation-key-cipher.js";

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

function registerStore() {
  return new DrizzleRegisterStore(
    db,
    installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
    undefined,
    recordingEnqueue(),
  );
}

function reconcile(registerId: string) {
  return registerStore().transaction((tx) =>
    tx.reconcileRealTimeNumbering(registerId, ENROLLED_AT),
  );
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
  await db
    .insert(taxAuthorityLastAuthorizedNumbers)
    .values({ pointOfSaleNumber: pointOfSale, lastAuthorized, readAt: ENROLLED_AT });
}

describe("reconciling a register's real-time numbering on a real Postgres", () => {
  it("freezes the point of sale at the count the cloud holds, tells the register and enqueues the reconciliation", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 51,
      name: "caja-51",
    });
    await holdCount(51, 25);
    const before = await lastLoggedChangeSeq(db);

    await reconcile(registerId);

    expect(await freezeOf(51)).toEqual({ countBeforeFreeze: 25, frozenAt: ENROLLED_AT });
    expect(enqueuedReconciliations).toEqual([51]);
    expect(await changesLoggedAfter(db, before)).toEqual([
      expect.objectContaining({ entity: "register_point_of_sale", entityId: registerId }),
    ]);
  });

  it("enqueues the real reconciliation job with the freeze and none when the enrollment rolls back", async () => {
    const committed = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 52,
      name: "caja-52",
    });
    const rolledBack = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 57,
      name: "caja-57",
    });
    await holdCount(52, 7);
    await holdCount(57, 8);
    const store = new DrizzleRegisterStore(
      db,
      installationKeyCipher(TEST_INSTALLATION_KEYS_ENCRYPTION_KEY),
      undefined,
      enqueueNumberingReconciliationJob,
    );

    await store.transaction((tx) => tx.reconcileRealTimeNumbering(committed, ENROLLED_AT));
    await expect(
      store.transaction(async (tx) => {
        await tx.reconcileRealTimeNumbering(rolledBack, ENROLLED_AT);
        throw new Error("the enrollment failed after reconciling");
      }),
    ).rejects.toThrow("the enrollment failed");

    const jobs = await sql<{ pointOfSale: number }[]>`
      select (j.payload->>'pointOfSale')::int as "pointOfSale"
      from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = ${RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER}`;
    expect(jobs).toEqual([{ pointOfSale: 52 }]);
  });

  it("freezes nothing when the cloud holds no count, so a sweep never starts from zero", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 53,
      name: "caja-53",
    });
    const before = await lastLoggedChangeSeq(db);

    await reconcile(registerId);

    expect(await freezeOf(53)).toBeUndefined();
    expect(enqueuedReconciliations).toEqual([]);
    expect(await changesLoggedAfter(db, before)).toEqual([]);
  });

  it("freezes nothing for a register without a real-time point of sale", async () => {
    await expect(reconcile(crypto.randomUUID())).resolves.toBeUndefined();

    expect(enqueuedReconciliations).toEqual([]);
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

    await reconcile(registerId);

    expect(await freezeOf(54)).toEqual({ countBeforeFreeze: 12, frozenAt: EARLIER_FREEZE });
  });

  it("leaves no freeze behind when the enrollment rolls back", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 55,
      name: "caja-55",
    });
    await holdCount(55, 9);

    await expect(
      registerStore().transaction(async (tx) => {
        await tx.reconcileRealTimeNumbering(registerId, ENROLLED_AT);
        throw new Error("the enrollment failed after reconciling");
      }),
    ).rejects.toThrow("the enrollment failed");

    expect(await freezeOf(55)).toBeUndefined();
  });

  it("waits for a numbering diagnosis running on the same point of sale and then keeps the freeze it recorded", async () => {
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
      await db
        .insert(numberingFreezes)
        .values({ pointOfSaleNumber: 56, countBeforeFreeze: 28, frozenAt: EARLIER_FREEZE });
      diagnosisHoldsLane();
      await diagnosisMayEnd;
    });
    await laneHeld;

    let reconciled = false;
    const enrollment = reconcile(registerId).then(() => {
      reconciled = true;
    });
    await vi.waitFor(async () => {
      const waiting = await sql`select 1 from pg_locks where locktype = 'advisory' and not granted`;
      expect(waiting).toHaveLength(1);
    });
    expect(reconciled).toBe(false);

    endDiagnosis();
    await diagnosis;
    await enrollment;

    expect(reconciled).toBe(true);
    expect(await freezeOf(56)).toEqual({ countBeforeFreeze: 28, frozenAt: EARLIER_FREEZE });
  });
});

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fiscalRequests, numberingFreezes } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  enqueueMissingNumberingConflicts,
  enqueueNumberingDiagnosisJob,
  enqueueNumberingReconciliationJob,
} from "./graphile-numbering-conflict-queue.js";
import {
  DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER,
  RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER,
} from "./numbering-conflict-task.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";

const ANSWERED_AT = new Date("2026-10-06T15:00:02.000Z");
const FROZEN_AT = new Date("2026-10-06T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeEach(async () => {
  integrationDb = await createIntegrationDatabase("numbering_conflict_queue");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterEach(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function pendingJobs(identifier: string) {
  return sql<{ payload: Record<string, unknown>; key: string; priority: number }[]>`
    select j.payload, j.key, j.priority
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${identifier}
    order by j.key`;
}

async function recordRequest(
  registerId: string,
  number: number,
  columns: Partial<typeof fiscalRequests.$inferInsert> = {},
) {
  const request = authorizationRequestRecord(registerId, { number });
  await db.insert(fiscalRequests).values({ ...request, ...columns });
  return request.fiscalDocumentId;
}

describe("the numbering conflict jobs on a real Postgres", () => {
  it("enqueues the diagnosis of a document with its key and a priority above every other job", async () => {
    const fiscalDocumentId = crypto.randomUUID();

    await enqueueNumberingDiagnosisJob(db, fiscalDocumentId);

    expect(await pendingJobs(DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER)).toEqual([
      {
        payload: { fiscalDocumentId },
        key: `${DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER}:${fiscalDocumentId}`,
        priority: -20,
      },
    ]);
  });

  it("keeps a single diagnosis per document when it is enqueued again", async () => {
    const fiscalDocumentId = crypto.randomUUID();

    await enqueueNumberingDiagnosisJob(db, fiscalDocumentId);
    await enqueueNumberingDiagnosisJob(db, fiscalDocumentId);

    expect(await pendingJobs(DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER)).toHaveLength(1);
  });

  it("enqueues the reconciliation of a point of sale with its key and a priority above every other job", async () => {
    await enqueueNumberingReconciliationJob(db, 7);

    expect(await pendingJobs(RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER)).toEqual([
      {
        payload: { pointOfSale: 7 },
        key: `${RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER}:7`,
        priority: -20,
      },
    ]);
  });

  it("keeps a single reconciliation per point of sale when it is enqueued again", async () => {
    await enqueueNumberingReconciliationJob(db, 7);
    await enqueueNumberingReconciliationJob(db, 7);
    await enqueueNumberingReconciliationJob(db, 8);

    expect(
      (await pendingJobs(RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER)).map((job) => job.payload),
    ).toEqual([{ pointOfSale: 7 }, { pointOfSale: 8 }]);
  });

  it("enqueues nothing when the transaction that enqueues it rolls back", async () => {
    await expect(
      db.transaction(async (transaction) => {
        await enqueueNumberingReconciliationJob(transaction, 7);
        throw new Error("the transaction failed after enqueueing");
      }),
    ).rejects.toThrow("the transaction failed");

    expect(await pendingJobs(RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER)).toEqual([]);
  });

  describe("at startup", () => {
    it("enqueues the reconciliation of every point of sale holding a freeze", async () => {
      await db.insert(numberingFreezes).values([
        { pointOfSaleNumber: 7, countBeforeFreeze: 4, frozenAt: FROZEN_AT },
        { pointOfSaleNumber: 9, countBeforeFreeze: 0, frozenAt: FROZEN_AT },
      ]);

      await enqueueMissingNumberingConflicts(db);
      await enqueueMissingNumberingConflicts(db);

      expect(
        (await pendingJobs(RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER)).map((job) => job.payload),
      ).toEqual([{ pointOfSale: 7 }, { pointOfSale: 9 }]);
      expect((await pendingJobs(RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER))[0]?.priority).toBe(
        -20,
      );
    });

    it("enqueues the diagnosis of every document left unclear by the numbering conflict code and not diagnosed yet", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const undiagnosed = await recordRequest(registerId, 1, {
        answerKind: "unclear",
        unclearCodes: [10015, 10016],
        answeredAt: ANSWERED_AT,
      });
      await recordRequest(registerId, 2, {
        answerKind: "unclear",
        unclearCodes: [10016],
        answeredAt: ANSWERED_AT,
        diagnosis: "collision",
        diagnosedAt: ANSWERED_AT,
      });
      await recordRequest(registerId, 3, {
        answerKind: "unclear",
        unclearCodes: [10015],
        answeredAt: ANSWERED_AT,
      });
      await recordRequest(registerId, 4, {
        answerKind: "unclear",
        unclearCodes: [],
        answeredAt: ANSWERED_AT,
      });
      await recordRequest(registerId, 5, {
        answerKind: "authorized",
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-16",
        answeredAt: ANSWERED_AT,
      });

      await enqueueMissingNumberingConflicts(db);
      await enqueueMissingNumberingConflicts(db);

      expect(
        (await pendingJobs(DIAGNOSE_NUMBERING_CONFLICT_TASK_IDENTIFIER)).map((job) => job.payload),
      ).toEqual([{ fiscalDocumentId: undiagnosed }]);
    });

    it("enqueues nothing when no conflict is owed", async () => {
      await enqueueMissingNumberingConflicts(db);

      expect(await sql`select 1 from graphile_worker._private_jobs`).toEqual([]);
    });

    it("leaves the time a pending job is due as it was", async () => {
      await db
        .insert(numberingFreezes)
        .values({ pointOfSaleNumber: 7, countBeforeFreeze: 4, frozenAt: FROZEN_AT });
      const dueAt = new Date("2126-01-01T00:00:00.000Z");
      await sql`select graphile_worker.add_job(
        ${RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER}::text,
        '{"pointOfSale":7}'::json,
        job_key => ${`${RECONCILE_NUMBERING_CONFLICT_TASK_IDENTIFIER}:7`}::text,
        run_at => ${dueAt.toISOString()}::timestamptz
      )`;

      await enqueueMissingNumberingConflicts(db);

      const [job] = await sql<
        { run_at: Date | string }[]
      >`select run_at from graphile_worker._private_jobs`;
      expect(new Date(job?.run_at ?? 0)).toEqual(dueAt);
    });
  });
});

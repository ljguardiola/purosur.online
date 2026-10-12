import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fiscalRequests } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import {
  enqueueMissingUnclearOutcomes,
  enqueueUnclearOutcomeJob,
  withdrawUnclearOutcomeJob,
} from "./graphile-unclear-outcome-queue.js";
import {
  authorizationRequestRecord,
  insertRegisterWithPointOfSale,
} from "./test-support/authorization-request-fixtures.js";
import { UNCLEAR_OUTCOME_TASK_IDENTIFIER } from "./unclear-outcome-task.js";

const ANSWERED_AT = new Date("2026-10-06T15:00:02.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeEach(async () => {
  integrationDb = await createIntegrationDatabase("unclear_outcome_queue");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterEach(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function pendingJobs() {
  const rows = await sql<
    {
      payload: { fiscalDocumentId: string };
      key: string;
      priority: number;
      run_at: Date | string;
    }[]
  >`
    select j.payload, j.key, j.priority, j.run_at
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${UNCLEAR_OUTCOME_TASK_IDENTIFIER}
    order by j.payload->>'fiscalDocumentId'`;
  return rows;
}

async function allJobs() {
  return sql`select 1 from graphile_worker._private_jobs`;
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

const RUN_AT = new Date("2126-01-01T00:00:00.000Z");

describe("the unclear outcome jobs on a real Postgres", () => {
  it("enqueues the decision of a document with the key of the document and a priority above every other job", async () => {
    const fiscalDocumentId = crypto.randomUUID();

    await enqueueUnclearOutcomeJob(db, fiscalDocumentId, RUN_AT);

    const [job, ...others] = await pendingJobs();
    expect(others).toEqual([]);
    expect(job).toMatchObject({
      payload: { fiscalDocumentId },
      key: `${UNCLEAR_OUTCOME_TASK_IDENTIFIER}:${fiscalDocumentId}`,
      priority: -20,
    });
  });

  it("outranks the highest priority any other job of the cloud has", async () => {
    await sql`select graphile_worker.add_job('other-task', '{}'::json, priority => -10)`;
    await enqueueUnclearOutcomeJob(db, crypto.randomUUID(), RUN_AT);

    const [first] = await sql<{ identifier: string }[]>`
      select t.identifier from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      order by j.priority asc, j.run_at asc limit 1`;

    expect(first?.identifier).toBe(UNCLEAR_OUTCOME_TASK_IDENTIFIER);
  });

  it("keeps a single job per document when it is enqueued again", async () => {
    const fiscalDocumentId = crypto.randomUUID();

    await enqueueUnclearOutcomeJob(db, fiscalDocumentId, RUN_AT);
    await enqueueUnclearOutcomeJob(db, fiscalDocumentId, RUN_AT);

    expect(await pendingJobs()).toHaveLength(1);
  });

  it("runs the decision of a document at the time it is enqueued for", async () => {
    const runAt = new Date("2126-01-01T00:00:00.000Z");

    await enqueueUnclearOutcomeJob(db, crypto.randomUUID(), runAt);

    const [job] = await pendingJobs();
    expect(new Date(job?.run_at ?? 0)).toEqual(runAt);
  });

  it("moves the decision of a document to the new time when it is enqueued again", async () => {
    const fiscalDocumentId = crypto.randomUUID();
    const later = new Date("2126-01-01T00:00:00.000Z");
    const sooner = new Date("2125-06-01T00:00:00.000Z");
    await enqueueUnclearOutcomeJob(db, fiscalDocumentId, later);

    await enqueueUnclearOutcomeJob(db, fiscalDocumentId, sooner);

    const [job, ...others] = await pendingJobs();
    expect(others).toEqual([]);
    expect(new Date(job?.run_at ?? 0)).toEqual(sooner);
  });

  it("withdraws the decision of a document and only that one", async () => {
    const withdrawn = crypto.randomUUID();
    const kept = crypto.randomUUID();
    await enqueueUnclearOutcomeJob(db, withdrawn, RUN_AT);
    await enqueueUnclearOutcomeJob(db, kept, RUN_AT);

    await withdrawUnclearOutcomeJob(db, withdrawn);
    await withdrawUnclearOutcomeJob(db, crypto.randomUUID());

    expect((await pendingJobs()).map((job) => job.payload.fiscalDocumentId)).toEqual([kept]);
  });

  it("enqueues nothing when the transaction that enqueues it rolls back", async () => {
    await expect(
      db.transaction(async (transaction) => {
        await enqueueUnclearOutcomeJob(transaction, crypto.randomUUID(), RUN_AT);
        throw new Error("the transaction failed after enqueueing");
      }),
    ).rejects.toThrow("the transaction failed");

    expect(await pendingJobs()).toEqual([]);
  });

  describe("at startup", () => {
    it("enqueues the decision of every undecided document whose answer is missing, unclear or not attempted", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const waiting = await recordRequest(registerId, 1);
      const unclear = await recordRequest(registerId, 2, {
        answerKind: "unclear",
        unclearCodes: [],
        answeredAt: ANSWERED_AT,
      });
      const notAttempted = await recordRequest(registerId, 3, {
        answerKind: "not_attempted",
        answeredAt: ANSWERED_AT,
      });

      await enqueueMissingUnclearOutcomes(db);
      await enqueueMissingUnclearOutcomes(db);

      expect((await pendingJobs()).map((job) => job.payload.fiscalDocumentId).sort()).toEqual(
        [waiting, unclear, notAttempted].sort(),
      );
      expect((await pendingJobs()).map((job) => job.priority)).toEqual([-20, -20, -20]);
    });

    it("enqueues nothing for a document that was authorized, rejected or already decided", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      await recordRequest(registerId, 1, {
        answerKind: "authorized",
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-16",
        answeredAt: ANSWERED_AT,
      });
      await recordRequest(registerId, 2, {
        answerKind: "rejected",
        rejectionCodes: [10242],
        rejectionClass: "content",
        answeredAt: ANSWERED_AT,
      });
      await recordRequest(registerId, 3, {
        answerKind: "unclear",
        unclearCodes: [],
        answeredAt: ANSWERED_AT,
        decision: "released",
        decidedAt: ANSWERED_AT,
      });

      await enqueueMissingUnclearOutcomes(db);

      expect(await allJobs()).toEqual([]);
    });

    it("enqueues nothing when no document needs a decision", async () => {
      await enqueueMissingUnclearOutcomes(db);

      expect(await allJobs()).toEqual([]);
    });

    it("leaves the time a pending job is due as it was", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const fiscalDocumentId = await recordRequest(registerId, 1, {
        answerKind: "unclear",
        unclearCodes: [],
        answeredAt: ANSWERED_AT,
      });
      const dueAt = new Date("2126-01-01T00:00:00.000Z");
      await sql`select graphile_worker.add_job(
        ${UNCLEAR_OUTCOME_TASK_IDENTIFIER}::text,
        ${JSON.stringify({ fiscalDocumentId })}::json,
        job_key => ${`${UNCLEAR_OUTCOME_TASK_IDENTIFIER}:${fiscalDocumentId}`}::text,
        run_at => ${dueAt.toISOString()}::timestamptz
      )`;

      await enqueueMissingUnclearOutcomes(db);

      const [job] = await pendingJobs();
      expect(new Date(job?.run_at ?? 0)).toEqual(dueAt);
    });
  });
});

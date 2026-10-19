import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creditNotes } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { CREDIT_NOTE_TASK_IDENTIFIER } from "./credit-note-task.js";
import { enqueueCreditNoteJob, enqueueMissingCreditNotes } from "./graphile-credit-note-queue.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";

const CREATED_AT = new Date("2026-10-08T01:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeEach(async () => {
  integrationDb = await createIntegrationDatabase("credit_note_queue");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterEach(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function pendingJobs() {
  return sql<{ payload: { creditNoteId: string }; key: string; priority: number }[]>`
    select j.payload, j.key, j.priority
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${CREDIT_NOTE_TASK_IDENTIFIER}
    order by j.payload->>'creditNoteId'`;
}

async function creditNoteRow(
  registerId: string,
  number: number,
  columns: Partial<typeof creditNotes.$inferInsert> = {},
) {
  const id = crypto.randomUUID();
  await db.insert(creditNotes).values({
    id,
    registerId,
    saleId: crypto.randomUUID(),
    pointOfSale: 7,
    associatedVoucherType: 11,
    associatedPointOfSale: 7,
    reason: "orphan",
    associatedNumber: number,
    keptVoucherType: 11,
    keptPointOfSale: 31,
    keptNumber: number,
    total: 1500,
    receiverTaxStatusCode: 5,
    createdAt: CREATED_AT,
    ...columns,
  });
  return id;
}

describe("the credit note jobs on a real Postgres", () => {
  it("enqueues the issuing of a credit note with its key and a priority above every other job", async () => {
    const creditNoteId = crypto.randomUUID();

    await enqueueCreditNoteJob(db, creditNoteId);

    const [job, ...others] = await pendingJobs();
    expect(others).toEqual([]);
    expect(job).toMatchObject({
      payload: { creditNoteId },
      key: `${CREDIT_NOTE_TASK_IDENTIFIER}:${creditNoteId}`,
      priority: -20,
    });
  });

  it("keeps a single job per credit note when it is enqueued again", async () => {
    const creditNoteId = crypto.randomUUID();

    await enqueueCreditNoteJob(db, creditNoteId);
    await enqueueCreditNoteJob(db, creditNoteId);

    expect(await pendingJobs()).toHaveLength(1);
  });

  it("enqueues nothing when the transaction that enqueues it rolls back", async () => {
    await expect(
      db.transaction(async (transaction) => {
        await enqueueCreditNoteJob(transaction, crypto.randomUUID());
        throw new Error("the transaction failed after enqueueing");
      }),
    ).rejects.toThrow("the transaction failed");

    expect(await pendingJobs()).toEqual([]);
  });

  describe("at startup", () => {
    it("enqueues every credit note not yet requested or whose request is still unclear", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const waiting = await creditNoteRow(registerId, 1);
      const requested = await creditNoteRow(registerId, 2, {
        number: 5,
        issuedOn: "2026-10-08",
        requestedAt: CREATED_AT,
      });
      const unclear = await creditNoteRow(registerId, 3, {
        number: 6,
        issuedOn: "2026-10-08",
        requestedAt: CREATED_AT,
        answerKind: "unclear",
        answeredAt: CREATED_AT,
      });

      await enqueueMissingCreditNotes(db);
      await enqueueMissingCreditNotes(db);

      expect((await pendingJobs()).map((job) => job.payload.creditNoteId).sort()).toEqual(
        [waiting, requested, unclear].sort(),
      );
      expect((await pendingJobs()).map((job) => job.priority)).toEqual([-20, -20, -20]);
    });

    it("enqueues nothing for a credit note that was authorized or rejected", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      await creditNoteRow(registerId, 1, {
        number: 5,
        issuedOn: "2026-10-08",
        requestedAt: CREATED_AT,
        answerKind: "authorized",
        answeredAt: CREATED_AT,
        authorizationCode: "74123456789055",
        authorizationCodeDueOn: "2026-10-18",
      });
      await creditNoteRow(registerId, 2, {
        number: 6,
        issuedOn: "2026-10-08",
        requestedAt: CREATED_AT,
        answerKind: "rejected",
        answeredAt: CREATED_AT,
        rejections: [{ code: 10015, message: "invalid receiver" }],
      });

      await enqueueMissingCreditNotes(db);

      expect(await pendingJobs()).toEqual([]);
    });

    it("leaves the time a pending job is due as it was", async () => {
      const registerId = await insertRegisterWithPointOfSale(db, {
        pointOfSaleNumber: 7,
        name: "caja-1",
      });
      const creditNoteId = await creditNoteRow(registerId, 1);
      const dueAt = new Date("2126-01-01T00:00:00.000Z");
      await sql`select graphile_worker.add_job(
        ${CREDIT_NOTE_TASK_IDENTIFIER}::text,
        ${JSON.stringify({ creditNoteId })}::json,
        job_key => ${`${CREDIT_NOTE_TASK_IDENTIFIER}:${creditNoteId}`}::text,
        run_at => ${dueAt.toISOString()}::timestamptz
      )`;

      await enqueueMissingCreditNotes(db);

      const [job] = await sql<{ run_at: Date | string }[]>`
        select j.run_at from graphile_worker._private_jobs j
        join graphile_worker._private_tasks t on t.id = j.task_id
        where t.identifier = ${CREDIT_NOTE_TASK_IDENTIFIER}`;
      expect(new Date(job?.run_at ?? 0)).toEqual(dueAt);
    });
  });
});

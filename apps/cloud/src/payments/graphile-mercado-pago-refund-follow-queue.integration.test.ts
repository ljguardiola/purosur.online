import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { enqueueMercadoPagoRefundFollowJob } from "./graphile-mercado-pago-refund-follow-queue.js";
import { MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER } from "./mercado-pago-refund-follow-task.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeEach(async () => {
  integrationDb = await createIntegrationDatabase("mercado_pago_refund_follow_queue");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterEach(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function pendingFollows() {
  return sql<{ key: string; due: boolean }[]>`
    select j.key, j.run_at <= now() as due
    from graphile_worker._private_jobs j
    join graphile_worker._private_tasks t on t.id = j.task_id
    where t.identifier = ${MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER}`;
}

describe("the Mercado Pago refund follow job on a real Postgres", () => {
  it("enqueues the follow, due now, under the key the follow reschedules itself with", async () => {
    await enqueueMercadoPagoRefundFollowJob(db);

    expect(await pendingFollows()).toEqual([
      { key: MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER, due: true },
    ]);
  });

  it("keeps a single follow when it is enqueued again", async () => {
    await enqueueMercadoPagoRefundFollowJob(db);
    await enqueueMercadoPagoRefundFollowJob(db);

    expect(await pendingFollows()).toHaveLength(1);
  });

  it("brings forward a follow scheduled for later", async () => {
    await sql`select graphile_worker.add_job(
      ${MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER}::text,
      '{}'::json,
      job_key => ${MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER}::text,
      run_at => now() + interval '1 hour'
    )`;

    await enqueueMercadoPagoRefundFollowJob(db);

    expect(await pendingFollows()).toEqual([
      { key: MERCADO_PAGO_REFUND_FOLLOW_TASK_IDENTIFIER, due: true },
    ]);
  });

  it("enqueues nothing when the transaction that enqueues it rolls back", async () => {
    await expect(
      db.transaction(async (transaction) => {
        await enqueueMercadoPagoRefundFollowJob(transaction);
        throw new Error("the transaction failed after enqueueing");
      }),
    ).rejects.toThrow("the transaction failed");

    expect(await pendingFollows()).toEqual([]);
  });
});

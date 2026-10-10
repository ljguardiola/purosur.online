import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { enqueueOfflineAuthorizationCodeRequest } from "./graphile-offline-authorization-code-queue.js";
import { OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER } from "./offline-authorization-code-task.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeEach(async () => {
  integrationDb = await createIntegrationDatabase("offline_authorization_code_queue");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterEach(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

interface RequestJob {
  attempts: number;
  maxAttempts: number;
  priority: number;
  runAt: Date;
  key: string | null;
}

async function requestJobs(): Promise<RequestJob[]> {
  const rows = await sql<
    { attempts: number; max_attempts: number; priority: number; run_at: Date; key: string | null }[]
  >`
    select attempts, max_attempts, priority, run_at, key from graphile_worker.jobs
    where task_identifier = ${OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER}`;
  return rows.map((row) => ({
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    priority: row.priority,
    runAt: row.run_at,
    key: row.key,
  }));
}

function pull() {
  return db.transaction((transaction) => enqueueOfflineAuthorizationCodeRequest(transaction));
}

async function failedFarInTheFuture(attempts: number): Promise<Date> {
  const runAt = new Date(Date.now() + 3 * 60 * 60_000);
  await sql`
    update graphile_worker._private_jobs set attempts = ${attempts}, run_at = ${runAt},
      last_error = 'ARCA did not answer'
    where key = ${OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER}`;
  return runAt;
}

describe("the on-demand request for the offline authorization code on a real Postgres", () => {
  it("enqueues one job that runs before every other job, with a bounded number of attempts", async () => {
    await pull();

    const [job, ...others] = await requestJobs();
    expect(others).toEqual([]);
    expect(job).toMatchObject({
      attempts: 0,
      priority: -10,
      maxAttempts: 10,
      key: OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER,
    });
  });

  it("adds no job while one is still waiting, whatever the number of pulls", async () => {
    await pull();
    await pull();
    await pull();

    expect(await requestJobs()).toHaveLength(1);
  });

  it("leaves a failed job's attempts and next run exactly as they are, pull after pull", async () => {
    await pull();
    const runAt = await failedFarInTheFuture(3);

    await pull();
    await pull();
    await pull();

    const [job, ...others] = await requestJobs();
    expect(others).toEqual([]);
    expect(job).toMatchObject({ attempts: 3, runAt });
  });

  it("leaves a job that is running alone, since its attempt is already counted", async () => {
    await pull();
    await sql`
      update graphile_worker._private_jobs set attempts = 1, locked_at = now(), locked_by = 'worker-1'
      where key = ${OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER}`;

    await pull();

    expect(await requestJobs()).toMatchObject([{ attempts: 1 }]);
  });

  it("revives a job that used up its attempts", async () => {
    await pull();
    await failedFarInTheFuture(10);

    await pull();

    const [job, ...others] = await requestJobs();
    expect(others).toEqual([]);
    expect(job?.attempts).toBe(0);
    expect(job?.runAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("enqueues exactly one job for pulls that run at the same time", async () => {
    const firstHasEnqueued = gate();
    const firstMayCommit = gate();
    const first = db.transaction(async (transaction) => {
      await enqueueOfflineAuthorizationCodeRequest(transaction);
      firstHasEnqueued.open();
      await firstMayCommit.opened;
    });
    await firstHasEnqueued.opened;
    const second = pull();
    await waitForLockWaiters(sql, 1);

    firstMayCommit.open();
    await Promise.all([first, second]);

    expect(await requestJobs()).toHaveLength(1);
  });

  it("leaves a failed job alone for pulls that run at the same time", async () => {
    await pull();
    const runAt = await failedFarInTheFuture(4);

    await Promise.all([pull(), pull(), pull(), pull()]);

    expect(await requestJobs()).toMatchObject([{ attempts: 4, runAt }]);
  });
});

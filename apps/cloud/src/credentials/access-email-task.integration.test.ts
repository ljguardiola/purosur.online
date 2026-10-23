import { randomUUID } from "node:crypto";
import { RECOVERY_TOKEN_LIFETIME_MS } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { type Job, quickAddJob, type RunnerOptions, runTaskListOnce } from "graphile-worker";
import pg from "pg";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startBackgroundJobRunner } from "../platform/background-job-runner.js";
import { alerts, auditLog, recoveryTokens, users } from "../platform/db/schema.js";
import {
  COMPLETED_JOB_DELETE,
  expireJobLock as expireJobLockIn,
  jobLock as jobLockIn,
  poolDroppingTheConnectionOnceOn,
} from "../test-support/graphile-job-queue.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { accessEmailJobs, RECOVERY_REQUEST_TASK_IDENTIFIER } from "./access-email-task.js";
import type { AccessEmailSender, SendRecoveryLinkInput } from "./recovery-email-sender.js";

const WAIT_OPTIONS = { timeout: 20_000, interval: 100 };
const NOW = new Date("2026-01-05T12:00:00.000Z");

let integrationDb: IntegrationDatabase;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("access_email_task");
}, 60_000);

afterAll(async () => {
  await integrationDb.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jobLock(jobId: string) {
  return jobLockIn(integrationDb.adminDatabaseUrl, jobId);
}

function expireJobLock(jobId: string) {
  return expireJobLockIn(integrationDb.adminDatabaseUrl, jobId);
}

function optionsOf(emailSender: AccessEmailSender) {
  return {
    databaseUrl: integrationDb.databaseUrl,
    jobs: [
      accessEmailJobs({
        now: () => NOW,
        backofficeOrigin: "https://staging.purosur.online",
        emailSender,
      }),
    ],
    schedules: false,
  };
}

describe("a recovery request whose link was sent but whose completion graphile-worker could not record", () => {
  async function inDatabase<T>(
    work: (db: PostgresJsDatabase<Record<string, never>>) => Promise<T>,
  ): Promise<T> {
    const sql = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
    try {
      return await work(drizzle(sql));
    } finally {
      await sql.end({ timeout: 1 });
    }
  }

  async function storedRecoveryState() {
    return inDatabase(async (db) => ({
      tokens: await db.select().from(recoveryTokens),
      tokenAuditRows: await db.select().from(auditLog).where(eq(auditLog.entity, "recovery_token")),
      alerts: await db
        .select()
        .from(alerts)
        .where(eq(alerts.kind, "backoffice_recovery_requested")),
    }));
  }

  it("is not served again when graphile-worker's stale-lock reset runs the job four hours later", async () => {
    const email = `rocio-${randomUUID()}@example.com`;
    await inDatabase(async (db) => {
      await db
        .insert(users)
        .values({ firstName: "Rocío Fictaria", email, locationId: await seededLocationId(db) });
    });
    const sent: SendRecoveryLinkInput[] = [];
    const sender: AccessEmailSender = {
      sendRecoveryLink: async (input) => {
        sent.push(input);
      },
      sendFirstPinCode: async () => {},
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dropping = poolDroppingTheConnectionOnceOn(
      integrationDb.databaseUrl,
      COMPLETED_JOB_DELETE,
    );
    const firstWorker = await startBackgroundJobRunner(optionsOf(sender), {
      createPool: () => dropping.pool,
      captureException: vi.fn(),
    });
    let job: Job;
    try {
      job = await quickAddJob(
        { connectionString: integrationDb.databaseUrl },
        RECOVERY_REQUEST_TASK_IDENTIFIER,
        {
          email,
          requestedAt: NOW.toISOString(),
          requestId: randomUUID(),
        },
      );
      await vi.waitFor(() => {
        expect(sent).toHaveLength(1);
        expect(dropping.droppedQueries()).toBeGreaterThan(0);
      }, WAIT_OPTIONS);
    } finally {
      await firstWorker.stop();
    }
    const afterFirstRun = await storedRecoveryState();
    expect(await jobLock(job.id)).toEqual({ attempts: 1, lockedAt: expect.any(Date) });
    await expireJobLock(job.id);

    let capturedTaskList: RunnerOptions["taskList"];
    const idleWorker = await startBackgroundJobRunner(optionsOf(sender), {
      createPool: () => new pg.Pool({ connectionString: integrationDb.databaseUrl }),
      runWorker: async (runnerOptions) => {
        capturedTaskList = runnerOptions.taskList;
        return { stop: async () => {}, promise: Promise.resolve() } as never;
      },
    });
    const pool = new pg.Pool({ connectionString: integrationDb.databaseUrl });
    try {
      const client = await pool.connect();
      try {
        await runTaskListOnce(
          { connectionString: integrationDb.databaseUrl },
          capturedTaskList ?? {},
          client,
        ).promise;
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
      await idleWorker.stop();
    }

    expect(await jobLock(job.id)).toBeUndefined();
    expect(sent).toHaveLength(1);
    const afterRerun = await storedRecoveryState();
    expect(afterRerun.tokens).toHaveLength(1);
    expect(afterRerun.tokens[0]?.voidedAt).toBeNull();
    expect(afterRerun.tokenAuditRows).toHaveLength(1);
    expect(afterRerun).toEqual(afterFirstRun);
  });
});

describe("a recovery request first processed after it stopped being current", () => {
  it("runs once and sends nothing", async () => {
    const email = `rocio-${randomUUID()}@example.com`;
    const sql = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
    try {
      const db = drizzle(sql);
      await db
        .insert(users)
        .values({ firstName: "Rocío Fictaria", email, locationId: await seededLocationId(db) });
    } finally {
      await sql.end({ timeout: 1 });
    }
    const sent: SendRecoveryLinkInput[] = [];
    const worker = await startBackgroundJobRunner(
      optionsOf({
        sendRecoveryLink: async (input) => {
          sent.push(input);
        },
        sendFirstPinCode: async () => {},
      }),
    );
    const requestedAt = new Date(NOW.getTime() - RECOVERY_TOKEN_LIFETIME_MS);
    try {
      const job = await quickAddJob(
        { connectionString: integrationDb.databaseUrl },
        RECOVERY_REQUEST_TASK_IDENTIFIER,
        { email, requestedAt: requestedAt.toISOString(), requestId: randomUUID() },
      );
      await vi.waitFor(async () => {
        expect(await jobLock(job.id)).toBeUndefined();
      }, WAIT_OPTIONS);
    } finally {
      await worker.stop();
    }

    expect(sent).toEqual([]);
  });
});

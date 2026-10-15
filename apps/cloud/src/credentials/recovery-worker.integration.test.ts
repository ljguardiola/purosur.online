import { randomUUID } from "node:crypto";
import { RECOVERY_TOKEN_LIFETIME_MS } from "@purosur/domain";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  type Job,
  quickAddJob,
  type RunnerOptions,
  run,
  runTaskListOnce,
  type Worker,
} from "graphile-worker";
import pg from "pg";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { alerts, auditLog, recoveryTokens, users } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import type { AccessEmailSender, SendRecoveryLinkInput } from "./recovery-email-sender.js";
import {
  RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER,
  RECOVERY_REQUEST_TASK_IDENTIFIER,
  startRecoveryWorker,
} from "./recovery-worker.js";

const WAIT_OPTIONS = { timeout: 20_000, interval: 100 };
const NOW = new Date("2026-01-05T12:00:00.000Z");
const DROPPED_CONNECTION = "Connection terminated unexpectedly";
const FAILED_JOB_UPDATE = /update\s+\S*_private_jobs as jobs\s+set\s+last_error/;
const COMPLETED_JOB_DELETE = /delete from\s+\S*_private_jobs/;

const emailSender: AccessEmailSender = {
  sendRecoveryLink: async () => {},
  sendFirstPinCode: async () => {},
};

let integrationDb: IntegrationDatabase;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("recovery_worker");
}, 60_000);

afterAll(async () => {
  await integrationDb.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function poolDroppingTheConnectionOnceOn(connectionString: string, statement: RegExp) {
  const pool = new pg.Pool({ connectionString });
  let dropped = 0;
  pool.on("connect", (client) => {
    const query = client.query.bind(client);
    const dropOnStatement = (config: unknown, ...rest: unknown[]) => {
      const text = typeof config === "string" ? config : (config as { text?: unknown })?.text;
      if (dropped === 0 && typeof text === "string" && statement.test(text)) {
        dropped += 1;
        return Promise.reject(new Error(DROPPED_CONNECTION));
      }
      return (query as (...args: unknown[]) => unknown)(config, ...rest);
    };
    client.query = dropOnStatement as typeof client.query;
  });
  return { pool, droppedQueries: () => dropped };
}

interface JobLock {
  attempts: number;
  lockedAt: Date | null;
}

async function jobLock(jobId: string): Promise<JobLock | undefined> {
  const sql = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  try {
    const rows = await sql<JobLock[]>`
      select attempts, locked_at as "lockedAt"
      from graphile_worker._private_jobs
      where id = ${jobId}
    `;
    return rows[0];
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function expireJobLock(jobId: string): Promise<void> {
  const sql = postgres(integrationDb.adminDatabaseUrl, { max: 1 });
  try {
    await sql`
      update graphile_worker._private_jobs
      set locked_at = locked_at - interval '4 hours 1 minute'
      where id = ${jobId}
    `;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

function enqueueMalformedRecoveryRequest(connectionString: string): Promise<Job> {
  return quickAddJob({ connectionString }, RECOVERY_REQUEST_TASK_IDENTIFIER, { malformed: true });
}

function enqueueRejectedAttemptFlush(connectionString: string): Promise<Job> {
  return quickAddJob({ connectionString }, RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER, {});
}

async function runJobsOnceAfterResettingStaleLocks(taskIdentifier: string): Promise<string[]> {
  const ran: string[] = [];
  const pool = new pg.Pool({ connectionString: integrationDb.databaseUrl });
  try {
    const client = await pool.connect();
    try {
      await runTaskListOnce(
        { connectionString: integrationDb.databaseUrl },
        {
          [taskIdentifier]: async (_payload, helpers) => {
            ran.push(helpers.job.id);
          },
        },
        client,
      ).promise;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  return ran;
}

async function expectLockedUntilItsLockExpires(job: Job): Promise<void> {
  expect(await jobLock(job.id)).toEqual({ attempts: 1, lockedAt: expect.any(Date) });
  expect(await runJobsOnceAfterResettingStaleLocks(job.task_identifier)).not.toContain(job.id);

  await expireJobLock(job.id);

  expect(await runJobsOnceAfterResettingStaleLocks(job.task_identifier)).toContain(job.id);
  expect(await jobLock(job.id)).toBeUndefined();
}

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function expectOutcomeReportedWithoutUnhandledRejection(
  statement: RegExp,
  enqueue: (connectionString: string) => Promise<Job>,
  report: RegExp,
  afterReport: (job: Job) => Promise<void> = async () => {},
): Promise<void> {
  const unhandled: unknown[] = [];
  const recordUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  const errors: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  const captureException = vi.fn();
  process.on("unhandledRejection", recordUnhandled);
  const dropping = poolDroppingTheConnectionOnceOn(integrationDb.databaseUrl, statement);
  const worker = await startRecoveryWorker(
    {
      databaseUrl: integrationDb.databaseUrl,
      backofficeOrigin: "https://staging.purosur.online",
      emailSender,
      now: () => NOW,
      schedules: false,
    },
    { createPool: () => dropping.pool, captureException },
  );

  let job: Job;
  try {
    job = await enqueue(integrationDb.databaseUrl);

    await vi.waitFor(() => {
      expect(dropping.droppedQueries()).toBeGreaterThan(0);
      expect(errors.filter((error) => report.test(error))).not.toEqual([]);
      expect(captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: DROPPED_CONNECTION }),
      );
    }, WAIT_OPTIONS);
    await nextMacrotask();

    expect(unhandled).toEqual([]);
  } finally {
    try {
      await worker.stop();
    } finally {
      process.off("unhandledRejection", recordUnhandled);
    }
  }
  await afterReport(job);
}

describe("startRecoveryWorker against a real Postgres whose connection drops while recording a job's outcome", () => {
  it("reports a failed job whose failure it could not record, instead of leaving the rejection unhandled", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      FAILED_JOB_UPDATE,
      enqueueMalformedRecoveryRequest,
      new RegExp(`Failed to record the failure of job .*${DROPPED_CONNECTION}`),
    );
  });

  it("reports a finished job whose completion it could not record, instead of leaving the rejection unhandled", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      COMPLETED_JOB_DELETE,
      enqueueRejectedAttemptFlush,
      new RegExp(`Failed to record the completion of job .*${DROPPED_CONNECTION}`),
    );
  });

  it("keeps a failed job whose failure it could not record locked until graphile-worker's stale-lock reset finds it four hours old, then runs it again", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      FAILED_JOB_UPDATE,
      enqueueMalformedRecoveryRequest,
      new RegExp(`Failed to record the failure of job .*${DROPPED_CONNECTION}`),
      expectLockedUntilItsLockExpires,
    );
  });

  it("keeps a finished job whose completion it could not record locked until graphile-worker's stale-lock reset finds it four hours old, then runs it again", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      COMPLETED_JOB_DELETE,
      enqueueRejectedAttemptFlush,
      new RegExp(`Failed to record the completion of job .*${DROPPED_CONNECTION}`),
      expectLockedUntilItsLockExpires,
    );
  });
});

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
    const options = {
      databaseUrl: integrationDb.databaseUrl,
      backofficeOrigin: "https://staging.purosur.online",
      emailSender: sender,
      now: () => NOW,
      schedules: false,
    };
    const firstWorker = await startRecoveryWorker(options, {
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
    const idleWorker = await startRecoveryWorker(options, {
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
    const worker = await startRecoveryWorker({
      databaseUrl: integrationDb.databaseUrl,
      backofficeOrigin: "https://staging.purosur.online",
      emailSender: {
        sendRecoveryLink: async (input) => {
          sent.push(input);
        },
        sendFirstPinCode: async () => {},
      },
      now: () => NOW,
      schedules: false,
    });
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

const FINISHING_TASK_IDENTIFIER = "finishes-when-let-go";

interface StoppingWorker {
  enqueue: () => Promise<Job>;
  stopThenLetTheJobFinish: () => Promise<void>;
}

function poolHandingOutClientsLate(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  const connect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;
  pool.connect = ((...args: unknown[]) =>
    args.length > 0
      ? connect(...args)
      : new Promise((resolve) => setImmediate(resolve)).then(() =>
          connect(),
        )) as typeof pool.connect;
  const listeningClients = new Set<unknown>();
  pool.on("connect", (client) => {
    const query = client.query.bind(client);
    client.query = ((config: unknown, ...rest: unknown[]) => {
      const text = typeof config === "string" ? config : (config as { text?: unknown })?.text;
      if (typeof text === "string" && /^\s*listen\b/i.test(text)) {
        listeningClients.add(client);
      }
      return (query as (...args: unknown[]) => unknown)(config, ...rest);
    }) as typeof client.query;
  });
  const stoppedListening = new Promise<void>((resolve) => {
    pool.on("release", (_error: unknown, client: unknown) => {
      if (listeningClients.has(client)) {
        resolve();
      }
    });
  });
  return { pool, stoppedListening };
}

async function startWorkerWithAJobFinishingAsItStops(
  finish: () => Promise<void>,
): Promise<StoppingWorker> {
  const { pool, stoppedListening } = poolHandingOutClientsLate(integrationDb.databaseUrl);
  let jobStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    jobStarted = resolve;
  });
  let letGo!: () => void;
  const letGoOfTheJob = new Promise<void>((resolve) => {
    letGo = resolve;
  });
  let workerOfTheJob: Worker | undefined;
  let otherWorkersStopped!: () => void;
  const othersStopped = new Promise<void>((resolve) => {
    otherWorkersStopped = resolve;
  });
  const worker = await startRecoveryWorker(
    {
      databaseUrl: integrationDb.databaseUrl,
      backofficeOrigin: "https://staging.purosur.online",
      emailSender,
      now: () => NOW,
      schedules: false,
      jobs: [
        {
          taskList: {
            [FINISHING_TASK_IDENTIFIER]: async () => {
              jobStarted();
              await letGoOfTheJob;
              await finish();
            },
          },
          crontab: [],
        },
      ],
    },
    {
      createPool: () => pool,
      captureException: vi.fn(),
      runWorker: (options) => {
        options.events?.on("job:start", ({ worker: jobWorker, job }) => {
          if (job.task_identifier === FINISHING_TASK_IDENTIFIER) {
            workerOfTheJob = jobWorker;
          }
        });
        options.events?.on("worker:stop", ({ worker: stoppedWorker }) => {
          if (stoppedWorker !== workerOfTheJob) {
            otherWorkersStopped();
          }
        });
        return run(options);
      },
    },
  );
  return {
    enqueue: () =>
      quickAddJob({ connectionString: integrationDb.databaseUrl }, FINISHING_TASK_IDENTIFIER, {}),
    async stopThenLetTheJobFinish() {
      await started;
      const stopping = worker.stop();
      await Promise.all([stoppedListening, othersStopped]);
      letGo();
      await stopping;
    },
  };
}

describe("startRecoveryWorker stopped while a job is still running", () => {
  it("records the completion of the job before it stops, so the job never stays locked in the queue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const worker = await startWorkerWithAJobFinishingAsItStops(async () => {});
    const job = await worker.enqueue();

    await worker.stopThenLetTheJobFinish();

    expect(await jobLock(job.id)).toBeUndefined();
  });

  it("records the failure of the job before it stops, so the job is unlocked for its next attempt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const worker = await startWorkerWithAJobFinishingAsItStops(async () => {
      throw new Error("the job failed as the worker stopped");
    });
    const job = await worker.enqueue();

    await worker.stopThenLetTheJobFinish();

    expect(await jobLock(job.id)).toEqual({ attempts: 1, lockedAt: null });
  });
});

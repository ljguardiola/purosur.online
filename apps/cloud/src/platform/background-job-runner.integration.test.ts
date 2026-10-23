import { type Job, quickAddJob, run, runTaskListOnce, type Worker } from "graphile-worker";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  COMPLETED_JOB_DELETE,
  DROPPED_CONNECTION,
  expireJobLock as expireJobLockIn,
  jobLock as jobLockIn,
  poolDroppingTheConnectionOnceOn,
} from "../test-support/graphile-job-queue.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { startBackgroundJobRunner } from "./background-job-runner.js";

const WAIT_OPTIONS = { timeout: 20_000, interval: 100 };
const FAILED_JOB_UPDATE = /update\s+\S*_private_jobs as jobs\s+set\s+last_error/;

const FAILING_TASK_IDENTIFIER = "fails-when-run";
const SUCCEEDING_TASK_IDENTIFIER = "succeeds-when-run";

const testJobs = {
  taskList: {
    [FAILING_TASK_IDENTIFIER]: async () => {
      throw new Error("the job failed");
    },
    [SUCCEEDING_TASK_IDENTIFIER]: async () => {},
  },
  crontab: [],
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

function jobLock(jobId: string) {
  return jobLockIn(integrationDb.adminDatabaseUrl, jobId);
}

function expireJobLock(jobId: string) {
  return expireJobLockIn(integrationDb.adminDatabaseUrl, jobId);
}

function enqueueFailingJob(connectionString: string): Promise<Job> {
  return quickAddJob({ connectionString }, FAILING_TASK_IDENTIFIER, {});
}

function enqueueSucceedingJob(connectionString: string): Promise<Job> {
  return quickAddJob({ connectionString }, SUCCEEDING_TASK_IDENTIFIER, {});
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
  const worker = await startBackgroundJobRunner(
    { databaseUrl: integrationDb.databaseUrl, jobs: [testJobs], schedules: false },
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

describe("startBackgroundJobRunner against a real Postgres whose connection drops while recording a job's outcome", () => {
  it("reports a failed job whose failure it could not record, instead of leaving the rejection unhandled", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      FAILED_JOB_UPDATE,
      enqueueFailingJob,
      new RegExp(`Failed to record the failure of job .*${DROPPED_CONNECTION}`),
    );
  });

  it("reports a finished job whose completion it could not record, instead of leaving the rejection unhandled", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      COMPLETED_JOB_DELETE,
      enqueueSucceedingJob,
      new RegExp(`Failed to record the completion of job .*${DROPPED_CONNECTION}`),
    );
  });

  it("keeps a failed job whose failure it could not record locked until graphile-worker's stale-lock reset finds it four hours old, then runs it again", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      FAILED_JOB_UPDATE,
      enqueueFailingJob,
      new RegExp(`Failed to record the failure of job .*${DROPPED_CONNECTION}`),
      expectLockedUntilItsLockExpires,
    );
  });

  it("keeps a finished job whose completion it could not record locked until graphile-worker's stale-lock reset finds it four hours old, then runs it again", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      COMPLETED_JOB_DELETE,
      enqueueSucceedingJob,
      new RegExp(`Failed to record the completion of job .*${DROPPED_CONNECTION}`),
      expectLockedUntilItsLockExpires,
    );
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
  let startedListening!: () => void;
  const listening = new Promise<void>((resolve) => {
    startedListening = resolve;
  });
  pool.on("connect", (client) => {
    const query = client.query.bind(client);
    client.query = ((config: unknown, ...rest: unknown[]) => {
      const text = typeof config === "string" ? config : (config as { text?: unknown })?.text;
      if (typeof text === "string" && /^\s*listen\b/i.test(text)) {
        listeningClients.add(client);
        startedListening();
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
  return { pool, listening, stoppedListening };
}

async function startWorkerWithAJobFinishingAsItStops(
  finish: () => Promise<void>,
): Promise<StoppingWorker> {
  const { pool, listening, stoppedListening } = poolHandingOutClientsLate(
    integrationDb.databaseUrl,
  );
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
  const worker = await startBackgroundJobRunner(
    {
      databaseUrl: integrationDb.databaseUrl,
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
    async enqueue() {
      await listening;
      return quickAddJob(
        { connectionString: integrationDb.databaseUrl },
        FINISHING_TASK_IDENTIFIER,
        {},
      );
    },
    async stopThenLetTheJobFinish() {
      await started;
      const stopping = worker.stop();
      await Promise.all([stoppedListening, othersStopped]);
      letGo();
      await stopping;
    },
  };
}

describe("startBackgroundJobRunner stopped while a job is still running", () => {
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

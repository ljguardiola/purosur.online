import { EventEmitter } from "node:events";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Runner, RunnerOptions } from "graphile-worker";
import { run } from "graphile-worker";
import pg, { type Pool, type PoolClient } from "pg";
import { reportPoolErrors } from "./pool-connection-error-handler.js";
import {
  processRecoveryRequestJob,
  type RecoveryRequestJobPayload,
} from "./process-recovery-request-job.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";
import { flushClosedRecoveryRejectedAttemptWindows } from "./recovery-rejected-attempt-flush.js";
import { runShutdownSteps } from "./run-shutdown-steps.js";

export const RECOVERY_REQUEST_TASK_IDENTIFIER = "recovery-request";
export const RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER = "recovery-rejected-attempt-flush";

// Cron support is graphile-worker 0.18's own: its `RunnerOptions` takes this `crontab` string in
// place of a crontab file, so no cron process or crontab file is deployed alongside the service.
const RECOVERY_REJECTED_ATTEMPT_FLUSH_CRONTAB = `*/5 * * * * ${RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER}`;

// A slow job, such as an admitted request waiting on its email, never holds up every other one;
// jobs for the same account still serialize on their own lock.
const WORKER_CONCURRENCY = 2;

export interface RecoveryWorkerHandle {
  stop(): Promise<void>;
}

function createDatabase(client: PoolClient): NodePgDatabase<Record<string, never>> {
  return drizzle(client);
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecoveryRequestJobPayload(payload: unknown): payload is RecoveryRequestJobPayload {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const candidate = payload as Partial<Record<keyof RecoveryRequestJobPayload, unknown>>;
  return (
    typeof candidate.email === "string" &&
    typeof candidate.requestedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.requestedAt)) &&
    typeof candidate.requestId === "string" &&
    UUID_SHAPE.test(candidate.requestId)
  );
}

export interface StartRecoveryWorkerOptions {
  databaseUrl: string;
  backofficeOrigin: string;
  emailSender: RecoveryEmailSender;
  now?: () => Date;
}

export interface StartRecoveryWorkerDeps {
  /** Injected in tests; defaults to graphile-worker's own `run`. */
  runWorker?: (options: RunnerOptions) => Promise<Runner>;
  /** Injected in tests; defaults to drizzle over the client graphile-worker's own pool lends. */
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  /** Injected in tests to observe the call without a real database. */
  processJob?: typeof processRecoveryRequestJob;
  /** Injected in tests to observe the call without a real database. */
  flush?: typeof flushClosedRecoveryRejectedAttemptWindows;
  /**
   * Injected in tests; defaults to a real `pg.Pool` for `databaseUrl`. Owned here rather than by
   * graphile-worker's own pool (the one it builds when only `connectionString` is given), which
   * removes its own error handlers and calls `pgPool.end()` without awaiting it once the runner
   * stops — leaving a window where an idle client a test's `DROP DATABASE ... WITH FORCE`
   * disconnects mid-shutdown has no error listener and crashes the process. Keeping our own
   * handler installed until `stop()` has actually awaited closing the pool closes that window.
   */
  createPool?: (connectionString: string) => Pick<Pool, "on" | "end">;
}

/**
 * Starts graphile-worker inside this process, so the cloud service processes its own
 * `recovery-request` jobs, and the `recovery-rejected-attempt-flush` cron task, without a
 * separate worker deployment. Each job borrows a client from graphile-worker's own pool rather
 * than sharing a pool with the HTTP request path, and releases it before this task does anything
 * else: `recovery-request`'s own send only ever runs once `withPgClient` has resolved, so a
 * slow Resend call never holds a pool client checked out.
 */
export async function startRecoveryWorker(
  options: StartRecoveryWorkerOptions,
  deps: StartRecoveryWorkerDeps = {},
): Promise<RecoveryWorkerHandle> {
  const doRun = deps.runWorker ?? run;
  const doCreateDatabase = deps.createDatabase ?? createDatabase;
  const doProcessJob = deps.processJob ?? processRecoveryRequestJob;
  const doFlush = deps.flush ?? flushClosedRecoveryRejectedAttemptWindows;
  const doCreatePool =
    deps.createPool ?? ((connectionString: string) => new pg.Pool({ connectionString }));
  const now = options.now ?? (() => new Date());

  const pool = doCreatePool(options.databaseUrl);
  reportPoolErrors(pool, "recovery worker");

  // graphile-worker 0.18 rejects a second `stop()` with "Runner is already stopped" once its
  // worker pool or cron exited on its own (e.g. its database connections were dropped), and it
  // emits "stop" synchronously on the emitter passed as `events` the moment that happens.
  const events = new EventEmitter();
  let stoppedItself = false;
  events.once("stop", () => {
    stoppedItself = true;
  });

  const runner = await doRun({
    pgPool: pool as Pool,
    concurrency: WORKER_CONCURRENCY,
    crontab: RECOVERY_REJECTED_ATTEMPT_FLUSH_CRONTAB,
    events,
    taskList: {
      [RECOVERY_REQUEST_TASK_IDENTIFIER]: async (payload, helpers) => {
        if (!isRecoveryRequestJobPayload(payload)) {
          throw new Error(`${RECOVERY_REQUEST_TASK_IDENTIFIER}: malformed job payload`);
        }
        const result = await helpers.withPgClient((client) =>
          doProcessJob(doCreateDatabase(client), payload, {
            now,
            backofficeOrigin: options.backofficeOrigin,
          }),
        );
        if (result.send) {
          await options.emailSender.sendRecoveryLink(result.send);
        }
      },
      [RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => doFlush(doCreateDatabase(client), { now }));
      },
    },
  });

  return {
    async stop() {
      await runShutdownSteps([
        {
          label: "recovery runner",
          run: async () => {
            if (!stoppedItself) {
              await runner.stop();
            }
            // Whether we asked for it or the runner stopped itself, `promise` only settles once its
            // release has actually finished, so a job it is still draining never sees the pool
            // close from under it.
            await runner.promise;
          },
        },
        { label: "recovery worker pool", run: () => pool.end() },
      ]);
    },
  };
}

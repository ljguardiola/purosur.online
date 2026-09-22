import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Runner, RunnerOptions } from "graphile-worker";
import { run } from "graphile-worker";
import type { PoolClient } from "pg";
import {
  processRecoveryRequestJob,
  type RecoveryRequestJobPayload,
} from "./process-recovery-request-job.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";
import { flushClosedRecoveryRejectedAttemptWindows } from "./recovery-rejected-attempt-flush.js";

export const RECOVERY_REQUEST_TASK_IDENTIFIER = "recovery-request";
export const RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER = "recovery-rejected-attempt-flush";

// Cron support (a `crontab` string RunnerOptions accepts in place of a crontab file) is graphile-
// worker 0.18's own: apps/cloud/node_modules/graphile-worker/dist/interfaces.d.ts:644-650.
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
}

/**
 * Starts graphile-worker inside this process, so the cloud service processes its own
 * `recovery-request` jobs, and the `recovery-rejected-attempt-flush` cron task, without a
 * separate worker deployment. Each job borrows a client from graphile-worker's own pool rather
 * than sharing a pool with the HTTP request path, and releases it before this task does anything
 * else: `recovery-request`'s own send only ever runs once `withPgClient` has resolved (H3), so a
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
  const now = options.now ?? (() => new Date());

  const runner = await doRun({
    connectionString: options.databaseUrl,
    concurrency: WORKER_CONCURRENCY,
    crontab: RECOVERY_REJECTED_ATTEMPT_FLUSH_CRONTAB,
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

  return { stop: () => runner.stop() };
}

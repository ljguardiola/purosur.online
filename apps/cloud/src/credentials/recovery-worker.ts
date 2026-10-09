import { EventEmitter } from "node:events";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Runner, RunnerOptions } from "graphile-worker";
import { run } from "graphile-worker";
import pg, { type Pool, type PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { runShutdownSteps } from "../platform/run-shutdown-steps.js";
import { reportPoolErrors } from "./pool-connection-error-handler.js";
import { processRecoveryRequestJob } from "./process-recovery-request-job.js";
import type { AccessEmailSender } from "./recovery-email-sender.js";
import { reportRecoveryError } from "./recovery-error-reporting.js";
import { flushClosedRecoveryRejectedAttemptWindows } from "./recovery-rejected-attempt-flush.js";
import { recoveryRequestJobPayloadSchema } from "./recovery-request-job-payload.js";
import { findPinCodeByCode, sendFirstPinCodeEmailJob } from "./send-first-pin-code-email-job.js";

export const RECOVERY_REQUEST_TASK_IDENTIFIER = "recovery-request";
export const RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER = "recovery-rejected-attempt-flush";
export const FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER = "first-pin-code-email";

const RECOVERY_REJECTED_ATTEMPT_FLUSH_CRONTAB_LINE = `*/5 * * * * ${RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER}`;

// Jobs for the same account still serialize on their own advisory lock, so a slow job never
// blocks jobs for other accounts.
const WORKER_CONCURRENCY = 2;

export interface RecoveryWorkerHandle {
  stop(): Promise<void>;
}

export interface StartRecoveryWorkerOptions {
  databaseUrl: string;
  backofficeOrigin: string;
  emailSender: AccessEmailSender;
  now: () => Date;
  jobs?: readonly BackgroundJobs[];
}

export interface StartRecoveryWorkerDeps {
  runWorker?: (options: RunnerOptions) => Promise<Runner>;
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  processJob?: typeof processRecoveryRequestJob;
  flush?: typeof flushClosedRecoveryRejectedAttemptWindows;
  findPinCode?: typeof findPinCodeByCode;
  /**
   * Owned here, not by graphile-worker's pool: it removes error handlers and calls `pgPool.end()`
   * without awaiting it once the runner stops, crashing on a client that disconnects mid-shutdown.
   */
  createPool?: (connectionString: string) => Pick<Pool, "on" | "end">;
}

export async function startRecoveryWorker(
  options: StartRecoveryWorkerOptions,
  deps: StartRecoveryWorkerDeps = {},
): Promise<RecoveryWorkerHandle> {
  const doRun = deps.runWorker ?? run;
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doProcessJob = deps.processJob ?? processRecoveryRequestJob;
  const doFlush = deps.flush ?? flushClosedRecoveryRejectedAttemptWindows;
  const doFindPinCode = deps.findPinCode ?? findPinCodeByCode;
  const doCreatePool =
    deps.createPool ?? ((connectionString: string) => new pg.Pool({ connectionString }));
  const { now } = options;
  const jobs = options.jobs ?? [];

  const pool = doCreatePool(options.databaseUrl);
  reportPoolErrors(pool, "recovery worker");

  // graphile-worker 0.18 rejects a second stop() once its pool or cron already exited, emitting
  // "stop" synchronously on the events emitter when that happens.
  const events = new EventEmitter();
  let stoppedItself = false;
  events.once("stop", () => {
    stoppedItself = true;
  });

  const runner = await doRun({
    pgPool: pool as Pool,
    concurrency: WORKER_CONCURRENCY,
    // graphile-worker 0.18's RunnerOptions takes this crontab string in place of a crontab file.
    crontab: [
      RECOVERY_REJECTED_ATTEMPT_FLUSH_CRONTAB_LINE,
      ...jobs.flatMap((job) => job.crontab),
    ].join("\n"),
    events,
    taskList: {
      ...Object.assign({}, ...jobs.map((job) => job.taskList)),
      [RECOVERY_REQUEST_TASK_IDENTIFIER]: async (rawPayload, helpers) => {
        const parsed = recoveryRequestJobPayloadSchema.safeParse(rawPayload);
        if (!parsed.success) {
          throw new Error(`${RECOVERY_REQUEST_TASK_IDENTIFIER}: malformed job payload`);
        }
        const payload = parsed.data;
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
      [FIRST_PIN_CODE_EMAIL_TASK_IDENTIFIER]: (payload, helpers) =>
        sendFirstPinCodeEmailJob(payload, {
          emailSender: options.emailSender,
          now,
          findPinCode: (code) =>
            helpers.withPgClient((client) => doFindPinCode(doCreateDatabase(client), code)),
        }),
      [RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => doFlush(doCreateDatabase(client), { now }));
      },
    },
  });
  runner.promise.catch((error: unknown) => {
    reportRecoveryError("recovery worker: runner exited with an error", error);
  });

  return {
    async stop() {
      await runShutdownSteps([
        {
          label: "recovery runner",
          run: async () => {
            // runner.promise settles once graphile-worker's pool and cron exit, so a draining
            // job never sees the pool close from under it.
            try {
              if (!stoppedItself) {
                await runner.stop();
              }
            } finally {
              await runner.promise;
            }
          },
        },
        { label: "recovery worker pool", run: () => pool.end() },
      ]);
    },
  };
}

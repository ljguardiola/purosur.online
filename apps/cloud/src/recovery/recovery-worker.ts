import { EventEmitter } from "node:events";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Runner, RunnerOptions } from "graphile-worker";
import { run } from "graphile-worker";
import pg, { type Pool, type PoolClient } from "pg";
import { escalateOverdueAlerts } from "../alerts/alert-escalation.js";
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
export const ALERT_ESCALATION_TASK_IDENTIFIER = "alert-escalation";

// graphile-worker 0.18's `RunnerOptions` takes this `crontab` string in place of a crontab file,
// so no separate cron process is deployed alongside the service.
const CRONTAB = [
  `*/5 * * * * ${RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER}`,
  `*/5 * * * * ${ALERT_ESCALATION_TASK_IDENTIFIER}`,
].join("\n");

// A slow job never holds up every other one; jobs for the same account still serialize on their
// own advisory lock.
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
  flush?: typeof flushClosedRecoveryRejectedAttemptWindows;
  escalate?: typeof escalateOverdueAlerts;
  /**
   * Owned here, not by graphile-worker's own pool: that one removes its error handlers and calls
   * `pgPool.end()` without awaiting it once the runner stops, leaving a window where a client
   * disconnecting mid-shutdown has no error listener and crashes the process.
   */
  createPool?: (connectionString: string) => Pick<Pool, "on" | "end">;
}

export async function startRecoveryWorker(
  options: StartRecoveryWorkerOptions,
  deps: StartRecoveryWorkerDeps = {},
): Promise<RecoveryWorkerHandle> {
  const doRun = deps.runWorker ?? run;
  const doCreateDatabase = deps.createDatabase ?? createDatabase;
  const doProcessJob = deps.processJob ?? processRecoveryRequestJob;
  const doFlush = deps.flush ?? flushClosedRecoveryRejectedAttemptWindows;
  const doEscalate = deps.escalate ?? escalateOverdueAlerts;
  const doCreatePool =
    deps.createPool ?? ((connectionString: string) => new pg.Pool({ connectionString }));
  const now = options.now ?? (() => new Date());

  const pool = doCreatePool(options.databaseUrl);
  reportPoolErrors(pool, "recovery worker");

  // graphile-worker 0.18 rejects a second `stop()` once its worker pool or cron exited on its
  // own, and emits "stop" synchronously on the emitter passed as `events` when that happens.
  const events = new EventEmitter();
  let stoppedItself = false;
  events.once("stop", () => {
    stoppedItself = true;
  });

  const runner = await doRun({
    pgPool: pool as Pool,
    concurrency: WORKER_CONCURRENCY,
    crontab: CRONTAB,
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
      [ALERT_ESCALATION_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => doEscalate(doCreateDatabase(client), { now }));
      },
    },
  });

  return {
    async stop() {
      await runShutdownSteps([
        {
          label: "recovery runner",
          run: async () => {
            // `promise` settles once graphile-worker's own pool and cron have exited, so a
            // draining job never sees the pool close from under it.
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

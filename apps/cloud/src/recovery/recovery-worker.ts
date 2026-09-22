import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Runner, RunnerOptions } from "graphile-worker";
import { run } from "graphile-worker";
import type { PoolClient } from "pg";
import {
  processRecoveryRequestJob,
  type RecoveryRequestJobPayload,
} from "./process-recovery-request-job.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";

export const RECOVERY_REQUEST_TASK_IDENTIFIER = "recovery-request";

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
    typeof candidate.admitted === "boolean" &&
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
}

/**
 * Starts graphile-worker inside this process, so the cloud service processes its own
 * `recovery-request` jobs without a separate worker deployment. Each job borrows a client from
 * graphile-worker's own pool rather than sharing a pool with the HTTP request path.
 */
export async function startRecoveryWorker(
  options: StartRecoveryWorkerOptions,
  deps: StartRecoveryWorkerDeps = {},
): Promise<RecoveryWorkerHandle> {
  const doRun = deps.runWorker ?? run;
  const doCreateDatabase = deps.createDatabase ?? createDatabase;
  const doProcessJob = deps.processJob ?? processRecoveryRequestJob;
  const now = options.now ?? (() => new Date());

  const runner = await doRun({
    connectionString: options.databaseUrl,
    concurrency: WORKER_CONCURRENCY,
    taskList: {
      [RECOVERY_REQUEST_TASK_IDENTIFIER]: async (payload, helpers) => {
        if (!isRecoveryRequestJobPayload(payload)) {
          throw new Error(`${RECOVERY_REQUEST_TASK_IDENTIFIER}: malformed job payload`);
        }
        await helpers.withPgClient((client) =>
          doProcessJob(doCreateDatabase(client), payload, {
            now,
            backofficeOrigin: options.backofficeOrigin,
            emailSender: options.emailSender,
          }),
        );
      },
    },
  });

  return { stop: () => runner.stop() };
}

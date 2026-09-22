import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Runner, RunnerOptions } from "graphile-worker";
import { run } from "graphile-worker";
import postgres from "postgres";
import {
  processRecoveryRequestJob,
  type RecoveryRequestJobPayload,
} from "./process-recovery-request-job.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";

export const RECOVERY_REQUEST_TASK_IDENTIFIER = "recovery-request";

export interface RecoveryWorkerHandle {
  stop(): Promise<void>;
}

export interface DatabaseConnection {
  db: PostgresJsDatabase<Record<string, never>>;
  close(): Promise<void>;
}

function connectToDatabase(databaseUrl: string): DatabaseConnection {
  const sql = postgres(databaseUrl, { max: 1 });
  return { db: drizzle(sql), close: () => sql.end({ timeout: 1 }) };
}

function isRecoveryRequestJobPayload(payload: unknown): payload is RecoveryRequestJobPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    typeof (payload as { email?: unknown }).email === "string"
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
  /** Injected in tests; defaults to a fresh single-connection postgres-js client per job. */
  connectToDatabase?: (databaseUrl: string) => DatabaseConnection;
  /** Injected in tests to observe the call without a real database. */
  processJob?: typeof processRecoveryRequestJob;
}

/**
 * Starts graphile-worker inside this process, so the cloud service processes its own
 * `recovery-request` jobs without a separate worker deployment. Each job opens its own
 * short-lived database connection, the same pattern `create-first-administrator.ts` already uses
 * for a single one-shot operation, rather than sharing a pool with the HTTP request path.
 */
export async function startRecoveryWorker(
  options: StartRecoveryWorkerOptions,
  deps: StartRecoveryWorkerDeps = {},
): Promise<RecoveryWorkerHandle> {
  const doRun = deps.runWorker ?? run;
  const doConnect = deps.connectToDatabase ?? connectToDatabase;
  const doProcessJob = deps.processJob ?? processRecoveryRequestJob;
  const now = options.now ?? (() => new Date());

  const runner = await doRun({
    connectionString: options.databaseUrl,
    taskList: {
      [RECOVERY_REQUEST_TASK_IDENTIFIER]: async (payload) => {
        if (!isRecoveryRequestJobPayload(payload)) {
          throw new Error(`${RECOVERY_REQUEST_TASK_IDENTIFIER}: malformed job payload`);
        }
        const connection = doConnect(options.databaseUrl);
        try {
          await doProcessJob(connection.db, payload, {
            now,
            backofficeOrigin: options.backofficeOrigin,
            emailSender: options.emailSender,
          });
        } finally {
          await connection.close();
        }
      },
    },
  });

  return { stop: () => runner.stop() };
}

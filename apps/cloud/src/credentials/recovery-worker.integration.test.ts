import { quickAddJob } from "graphile-worker";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import type { AccessEmailSender } from "./recovery-email-sender.js";
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

function poolDroppingTheConnectionOn(connectionString: string, statement: RegExp) {
  const pool = new pg.Pool({ connectionString });
  let dropped = 0;
  pool.on("connect", (client) => {
    const query = client.query.bind(client);
    const dropOnStatement = (config: unknown, ...rest: unknown[]) => {
      const text = typeof config === "string" ? config : (config as { text?: unknown })?.text;
      if (typeof text === "string" && statement.test(text)) {
        dropped += 1;
        return Promise.reject(new Error(DROPPED_CONNECTION));
      }
      return (query as (...args: unknown[]) => unknown)(config, ...rest);
    };
    client.query = dropOnStatement as typeof client.query;
  });
  return { pool, droppedQueries: () => dropped };
}

function nextMacrotask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function expectOutcomeReportedWithoutUnhandledRejection(
  statement: RegExp,
  enqueue: (connectionString: string) => Promise<unknown>,
  report: RegExp,
): Promise<void> {
  const unhandled: unknown[] = [];
  const recordUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  const errors: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
  process.on("unhandledRejection", recordUnhandled);
  const dropping = poolDroppingTheConnectionOn(integrationDb.databaseUrl, statement);
  const worker = await startRecoveryWorker(
    {
      databaseUrl: integrationDb.databaseUrl,
      backofficeOrigin: "https://staging.purosur.online",
      emailSender,
      now: () => NOW,
    },
    { createPool: () => dropping.pool },
  );

  try {
    await enqueue(integrationDb.databaseUrl);

    await vi.waitFor(() => {
      expect(dropping.droppedQueries()).toBeGreaterThan(0);
      expect(errors.filter((error) => report.test(error))).not.toEqual([]);
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
}

describe("startRecoveryWorker against a real Postgres whose connection drops while recording a job's outcome", () => {
  it("reports a failed job whose failure it could not record, instead of leaving the rejection unhandled", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      FAILED_JOB_UPDATE,
      (connectionString) =>
        quickAddJob({ connectionString }, RECOVERY_REQUEST_TASK_IDENTIFIER, { malformed: true }),
      new RegExp(`Failed to record the failure of job .*${DROPPED_CONNECTION}`),
    );
  });

  it("reports a finished job whose completion it could not record, instead of leaving the rejection unhandled", async () => {
    await expectOutcomeReportedWithoutUnhandledRejection(
      COMPLETED_JOB_DELETE,
      (connectionString) =>
        quickAddJob({ connectionString }, RECOVERY_REJECTED_ATTEMPT_FLUSH_TASK_IDENTIFIER, {}),
      new RegExp(`Failed to record the completion of job .*${DROPPED_CONNECTION}`),
    );
  });
});

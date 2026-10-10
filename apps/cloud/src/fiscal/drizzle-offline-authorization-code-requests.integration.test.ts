import { type ChangeLog, pullChanges } from "@purosur/domain/sync/use-cases";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { DrizzleChangeLog } from "../sync/drizzle-change-log.js";
import type { PulledCloudChange } from "../sync/pulled-changes.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleOfflineAuthorizationCodeRequests } from "./drizzle-offline-authorization-code-requests.js";
import {
  type EnqueueOfflineAuthorizationCodeRequest,
  enqueueOfflineAuthorizationCodeRequest,
} from "./graphile-offline-authorization-code-queue.js";
import { OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER } from "./offline-authorization-code-task.js";
import { configureOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeEach(async () => {
  integrationDb = await createIntegrationDatabase("offline_authorization_code_requests");
  sql = postgres(integrationDb.databaseUrl, { max: 6 });
  db = drizzle(sql);
}, 60_000);

afterEach(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

async function installationOfARegisterWithAnOfflinePointOfSale(
  registerName: string,
  realTimePointOfSale: number,
  offlinePointOfSale: number,
): Promise<string> {
  const registerId = await configureOfflinePointOfSale(db, {
    registerName,
    realTimePointOfSale,
    offlinePointOfSale,
    now: NOW,
  });
  const { deviceId } = await insertEnrolledInstallation(db, {
    now: NOW,
    existingRegisterId: registerId,
  });
  return deviceId;
}

function pull(
  deviceId: string,
  {
    changeLog = new DrizzleChangeLog(db),
    enqueue = enqueueOfflineAuthorizationCodeRequest,
  }: {
    changeLog?: ChangeLog<PulledCloudChange>;
    enqueue?: EnqueueOfflineAuthorizationCodeRequest;
  } = {},
) {
  return pullChanges(
    {
      changeLog,
      offlineAuthorizationCodes: new DrizzleOfflineAuthorizationCodeRequests(db, enqueue, vi.fn()),
      clock: { now: () => NOW },
    },
    { deviceId, since: 0 },
  );
}

async function requestJobs(): Promise<readonly unknown[]> {
  return sql`
    select 1 from graphile_worker.jobs
    where task_identifier = ${OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER}`;
}

describe("requesting the offline authorization code on a pull, on a real Postgres", () => {
  it("never holds a pull up while another register's pull is still open", async () => {
    const first = await installationOfARegisterWithAnOfflinePointOfSale("Caja 1", 7, 8);
    const second = await installationOfARegisterWithAnOfflinePointOfSale("Caja 2", 9, 10);
    const firstHasRead = gate();
    const firstMayCommit = gate();
    const changeLog = new DrizzleChangeLog(db);
    const heldOpen: ChangeLog<PulledCloudChange> = {
      transaction: (work) =>
        changeLog.transaction(async (tx) => {
          const outcome = await work(tx);
          firstHasRead.open();
          await firstMayCommit.opened;
          return outcome;
        }),
    };
    const firstPull = pull(first, { changeLog: heldOpen });
    await firstHasRead.opened;

    await pull(second);

    firstMayCommit.open();
    await firstPull;
    expect(await requestJobs()).toHaveLength(1);
  });

  it("leaves exactly one request for two pulls that ask for it at the same time", async () => {
    const first = await installationOfARegisterWithAnOfflinePointOfSale("Caja 1", 7, 8);
    const second = await installationOfARegisterWithAnOfflinePointOfSale("Caja 2", 9, 10);
    const firstHasEnqueued = gate();
    const firstMayCommit = gate();
    const firstPull = pull(first, {
      enqueue: async (transaction) => {
        await enqueueOfflineAuthorizationCodeRequest(transaction);
        firstHasEnqueued.open();
        await firstMayCommit.opened;
      },
    });
    await firstHasEnqueued.opened;
    const secondPull = pull(second);
    await waitForLockWaiters(sql, 1);

    firstMayCommit.open();
    await Promise.all([firstPull, secondPull]);

    expect(await requestJobs()).toHaveLength(1);
  });
});

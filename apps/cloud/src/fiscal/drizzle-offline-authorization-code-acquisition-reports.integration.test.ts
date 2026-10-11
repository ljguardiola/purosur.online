import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleOfflineAuthorizationCodeAcquisitionReports } from "./drizzle-offline-authorization-code-acquisition-reports.js";

const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const NOW = new Date("2026-10-13T15:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("offline_authorization_code_acquisition_reports");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

async function onOwnConnection<TOutcome>(
  use: (connection: postgres.Sql) => Promise<TOutcome>,
): Promise<TOutcome> {
  const connection = postgres(integrationDb.databaseUrl, { max: 1 });
  try {
    return await use(connection);
  } finally {
    await connection.end({ timeout: 1 });
  }
}

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe("the offline authorization code acquisition reports on a real Postgres", () => {
  it("lets only one of two concurrent first reports of a fortnight and outcome kind win", async () => {
    const firstMayCommit = gate();
    const firstRecorded = gate();

    const first = onOwnConnection((connection) =>
      drizzle(connection).transaction(async (transaction) => {
        const accepted = await new DrizzleOfflineAuthorizationCodeAcquisitionReports(transaction, {
          now: () => NOW,
        }).recordFirstReport(SECOND_HALF, "not_recovered");
        firstRecorded.open();
        await firstMayCommit.opened;
        return accepted;
      }),
    );
    await firstRecorded.opened;
    const second = onOwnConnection((connection) =>
      new DrizzleOfflineAuthorizationCodeAcquisitionReports(drizzle(connection), {
        now: () => NOW,
      }).recordFirstReport(SECOND_HALF, "not_recovered"),
    );
    await waitForLockWaiters(sql, 1);
    firstMayCommit.open();

    expect(await Promise.all([first, second])).toEqual([true, false]);
  });
});

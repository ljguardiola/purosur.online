import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleRejectedDocumentRemedyStore } from "./drizzle-rejected-document-remedy-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import { WITHOUT_CREDIT_NOTES } from "./test-support/rejected-document-remedy-fixtures.js";

const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const KEY = { pointOfSaleNumber: 8, fortnight: FIRST_HALF };

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("rejected_document_remedy_store");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  await seedOfflinePointOfSale(drizzle(sql));
}, 60_000);

afterAll(async () => {
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

async function onOwnConnection<TOutcome>(
  use: (connection: ReturnType<typeof drizzle>) => Promise<TOutcome>,
): Promise<TOutcome> {
  const connection = postgres(integrationDb.databaseUrl, { max: 1 });
  try {
    return await use(drizzle(connection));
  } finally {
    await connection.end({ timeout: 1 });
  }
}

describe("the rejected document remedy store on a real Postgres", () => {
  it("waits for a run presenting the fortnight's documents before holding the presentation", async () => {
    const events: string[] = [];
    const runMayFinish = gate();
    const runHolds = gate();

    const run = onOwnConnection((db) =>
      new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(KEY, async () => {
        events.push("run started");
        runHolds.open();
        await runMayFinish.opened;
        events.push("run finished");
      }),
    );
    await runHolds.opened;
    const remedy = onOwnConnection((db) =>
      new DrizzleRejectedDocumentRemedyStore(db).transaction(async (tx) => {
        await tx.holdFortnightPresentation(KEY);
        events.push("remedy held the presentation");
      }),
    );
    await waitForLockWaiters(sql, 1);
    runMayFinish.open();
    await Promise.all([run, remedy]);

    expect(events).toEqual(["run started", "run finished", "remedy held the presentation"]);
  });

  it("makes a run wait for a remedy that holds the presentation, until the remedy commits", async () => {
    const events: string[] = [];
    const remedyMayFinish = gate();
    const remedyHolds = gate();

    const remedy = onOwnConnection((db) =>
      new DrizzleRejectedDocumentRemedyStore(db).transaction(async (tx) => {
        await tx.holdFortnightPresentation(KEY);
        remedyHolds.open();
        await remedyMayFinish.opened;
        events.push("remedy finished");
      }),
    );
    await remedyHolds.opened;
    const run = onOwnConnection((db) =>
      new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(KEY, async () => {
        events.push("run started");
      }),
    );
    await waitForLockWaiters(sql, 1);
    remedyMayFinish.open();
    await Promise.all([remedy, run]);

    expect(events).toEqual(["remedy finished", "run started"]);
  });

  it("does not make a remedy of another fortnight wait for a run", async () => {
    const runMayFinish = gate();
    const runHolds = gate();
    const run = onOwnConnection((db) =>
      new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(KEY, async () => {
        runHolds.open();
        await runMayFinish.opened;
      }),
    );
    await runHolds.opened;

    const held = await onOwnConnection((db) =>
      new DrizzleRejectedDocumentRemedyStore(db).transaction(async (tx) => {
        await tx.holdFortnightPresentation({ pointOfSaleNumber: 8, fortnight: SECOND_HALF });
        return "held";
      }),
    );
    runMayFinish.open();
    await run;

    expect(held).toBe("held");
  });
});

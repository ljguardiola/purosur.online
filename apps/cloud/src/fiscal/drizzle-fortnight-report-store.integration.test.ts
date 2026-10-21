import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { waitForLockWaiters } from "../test-support/queued-behind-held-lock.js";
import { CREDIT_NOTE_TASK_IDENTIFIER } from "./credit-note-task.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { enqueueCreditNoteJob } from "./graphile-credit-note-queue.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import { WITHOUT_CREDIT_NOTES } from "./test-support/rejected-document-remedy-fixtures.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const FIRST_KEY = { pointOfSaleNumber: 8, fortnight: OCTOBER_FIRST_HALF };
const AT = new Date("2026-10-16T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("fortnight_report_store");
  sql = postgres(integrationDb.databaseUrl, { max: 10 });
  await seedOfflinePointOfSale(drizzle(sql));
  for (const [fortnight, code] of [
    [OCTOBER_FIRST_HALF, "36123456789012"],
    [OCTOBER_SECOND_HALF, "36123456789013"],
  ] as const) {
    await new DrizzleOfflineAuthorizationCodeStore(drizzle(sql)).holdAcquisition(
      fortnight,
      (acquisition) =>
        acquisition.keep({
          code: { code, fortnight, reportDeadline: "2026-11-20" },
          obtainedAt: AT,
          obtainedThrough: "requested",
        }),
    );
  }
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function storeOn(connection: postgres.Sql) {
  return new DrizzleFortnightReportStore(drizzle(connection), WITHOUT_CREDIT_NOTES);
}

async function onOwnConnection<TOutcome>(
  use: (store: ReturnType<typeof storeOn>) => Promise<TOutcome>,
): Promise<TOutcome> {
  const connection = postgres(integrationDb.databaseUrl, { max: 1 });
  try {
    return await use(storeOn(connection));
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

describe("the fortnight report store on a real Postgres", () => {
  it("makes a second presentation of the same point of sale and fortnight wait until the first one finishes", async () => {
    const events: string[] = [];
    const firstMayFinish = gate();
    const firstHolds = gate();

    const first = onOwnConnection((store) =>
      store.holdReport(FIRST_KEY, async () => {
        events.push("first started");
        firstHolds.open();
        await firstMayFinish.opened;
        events.push("first finished");
      }),
    );
    await firstHolds.opened;
    const second = onOwnConnection((store) =>
      store.holdReport(FIRST_KEY, async () => {
        events.push("second started");
      }),
    );
    await waitForLockWaiters(sql, 1);
    firstMayFinish.open();
    await Promise.all([first, second]);

    expect(events).toEqual(["first started", "first finished", "second started"]);
  });

  it("keeps the lock across the separate commits of the presentation", async () => {
    const events: string[] = [];
    const firstRecorded = gate();
    const firstMayFinish = gate();

    const first = onOwnConnection((store) =>
      store.holdReport(FIRST_KEY, async (report) => {
        await report.record({ state: "submitting", at: AT });
        firstRecorded.open();
        await firstMayFinish.opened;
        await report.record({ state: "accepted", at: AT });
        events.push("first finished");
      }),
    );
    await firstRecorded.opened;
    const second = onOwnConnection((store) =>
      store.holdReport(FIRST_KEY, async (report) => {
        events.push(`second saw ${(await report.recorded())?.state}`);
      }),
    );
    await waitForLockWaiters(sql, 1);
    firstMayFinish.open();
    await Promise.all([first, second]);

    expect(events).toEqual(["first finished", "second saw accepted"]);
  });

  it("lets a presentation of another fortnight run while the first one is held", async () => {
    const firstMayFinish = gate();
    const firstHolds = gate();
    const first = onOwnConnection((store) =>
      store.holdReport(FIRST_KEY, async () => {
        firstHolds.open();
        await firstMayFinish.opened;
      }),
    );
    await firstHolds.opened;

    const other = await onOwnConnection((store) =>
      store.holdReport({ pointOfSaleNumber: 8, fortnight: OCTOBER_SECOND_HALF }, async () => "ran"),
    );
    firstMayFinish.open();
    await first;

    expect(other).toBe("ran");
  });

  it("lets the next presentation run once the work failed", async () => {
    await expect(
      onOwnConnection((store) =>
        store.holdReport(FIRST_KEY, async () => {
          throw new Error("the call to ARCA broke");
        }),
      ),
    ).rejects.toThrow("the call to ARCA broke");

    expect(await onOwnConnection((store) => store.holdReport(FIRST_KEY, async () => "ran"))).toBe(
      "ran",
    );
  });

  it("queues the issuing of a corrected document's credit note together with the credit note, once", async () => {
    const creditNote = {
      saleId: "0199b7a0-0000-7000-8000-000000000004",
      reason: "rejected_document",
      pointOfSale: 7,
      associatedVoucher: { voucherType: 11, pointOfSale: 8, number: 5 },
      total: 12_500,
      receiverTaxStatusCode: 5,
    } as const;
    const credit = async () => {
      const connection = postgres(integrationDb.databaseUrl, { max: 1 });
      try {
        await new DrizzleFortnightReportStore(drizzle(connection), {
          enqueueCreditNote: enqueueCreditNoteJob,
          now: () => AT,
        }).holdReport(FIRST_KEY, (report) => report.creditCorrectedDocument(creditNote));
      } finally {
        await connection.end({ timeout: 1 });
      }
    };

    await credit();
    await credit();

    const jobs = await sql<{ payload: { creditNoteId: string } }[]>`
      select j.payload from graphile_worker._private_jobs j
      join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = ${CREDIT_NOTE_TASK_IDENTIFIER}`;
    const notes = await sql<{ id: string }[]>`select id from credit_notes`;
    expect(notes).toHaveLength(1);
    expect(jobs.map(({ payload }) => payload.creditNoteId)).toEqual([notes[0]?.id]);
  });
});

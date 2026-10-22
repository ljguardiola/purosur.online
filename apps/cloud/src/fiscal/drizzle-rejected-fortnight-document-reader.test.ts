import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleRejectedFortnightDocumentReader } from "./drizzle-rejected-fortnight-document-reader.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import {
  insertRejectedDocumentRemedy,
  WITHOUT_CREDIT_NOTES,
} from "./test-support/rejected-document-remedy-fixtures.js";

const OCTOBER_FIRST_HALF: Fortnight = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF: Fortnight = { start: "2026-10-16", end: "2026-10-31" };
const ATTEMPTED_AT = new Date("2026-10-16T12:00:00.000Z");
const AN_EARLIER_ATTEMPT = new Date("2026-10-15T12:00:00.000Z");
const REMEDIED_AT = new Date("2026-10-17T12:00:00.000Z");

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let registerId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  registerId = await seedOfflinePointOfSale(db);
  for (const [fortnight, code] of [
    [OCTOBER_FIRST_HALF, "36123456789012"],
    [OCTOBER_SECOND_HALF, "36123456789013"],
  ] as const) {
    await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
      acquisition.keep({
        code: { code, fortnight, reportDeadline: "2026-11-20" },
        obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
        obtainedThrough: "requested",
      }),
    );
  }
});

function record(
  fortnight: Fortnight,
  progress: { state: "refused" | "accepted" | "submitting"; rejectedNumber?: number },
) {
  return new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(
    { pointOfSaleNumber: 8, fortnight },
    (report) =>
      report.recordDocumentType({
        documentType: "factura_c",
        at: ATTEMPTED_AT,
        reportedThrough: 3,
        ...progress,
      }),
  );
}

function awaitingRemedy() {
  return new DrizzleRejectedFortnightDocumentReader(db).presentationsAwaitingRemedy();
}

describe("DrizzleRejectedFortnightDocumentReader.presentationsAwaitingRemedy", () => {
  it("answers nothing when no document was rejected", async () => {
    await record(OCTOBER_FIRST_HALF, { state: "accepted" });
    await record(OCTOBER_SECOND_HALF, { state: "refused" });

    expect(await awaitingRemedy()).toEqual([]);
  });

  it("answers the rejected document of a presentation, with the register of its point of sale", async () => {
    await record(OCTOBER_FIRST_HALF, { state: "refused", rejectedNumber: 4 });

    expect(await awaitingRemedy()).toEqual([
      {
        pointOfSaleNumber: 8,
        registerId,
        fortnight: OCTOBER_FIRST_HALF,
        documentType: "factura_c",
        rejectedNumber: 4,
      },
    ]);
  });

  it("answers a rejected document whose only remedy was for an earlier rejection of it, or for another document", async () => {
    await record(OCTOBER_FIRST_HALF, { state: "refused", rejectedNumber: 4 });
    await insertRejectedDocumentRemedy(db, {
      pointOfSale: 8,
      fortnight: OCTOBER_FIRST_HALF,
      number: 4,
      correction: null,
      rejectedAt: AN_EARLIER_ATTEMPT,
      recordedAt: REMEDIED_AT,
    });
    await record(OCTOBER_SECOND_HALF, { state: "refused", rejectedNumber: 2 });
    await insertRejectedDocumentRemedy(db, {
      pointOfSale: 8,
      fortnight: OCTOBER_SECOND_HALF,
      number: 1,
      correction: null,
      rejectedAt: ATTEMPTED_AT,
      recordedAt: REMEDIED_AT,
    });

    const awaiting = await awaitingRemedy();

    expect(
      awaiting.map(({ fortnight, rejectedNumber }) => [fortnight.start, rejectedNumber]),
    ).toEqual(
      expect.arrayContaining([
        ["2026-10-01", 4],
        ["2026-10-16", 2],
      ]),
    );
    expect(awaiting).toHaveLength(2);
  });

  it("answers nothing for a rejected document remedied for its last rejection, even with a remedy recorded later for an earlier one", async () => {
    await record(OCTOBER_FIRST_HALF, { state: "refused", rejectedNumber: 4 });
    await insertRejectedDocumentRemedy(db, {
      pointOfSale: 8,
      fortnight: OCTOBER_FIRST_HALF,
      number: 4,
      correction: { issuedOn: "2026-10-02" },
      rejectedAt: ATTEMPTED_AT,
      recordedAt: REMEDIED_AT,
    });
    await insertRejectedDocumentRemedy(db, {
      pointOfSale: 8,
      fortnight: OCTOBER_FIRST_HALF,
      number: 4,
      correction: null,
      rejectedAt: AN_EARLIER_ATTEMPT,
      recordedAt: new Date(REMEDIED_AT.getTime() + 60_000),
    });

    expect(await awaitingRemedy()).toEqual([]);
  });
});

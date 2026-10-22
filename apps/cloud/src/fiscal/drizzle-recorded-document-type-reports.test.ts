import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { locations, registers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { recordedDocumentTypeReports } from "./drizzle-recorded-document-type-reports.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import {
  insertRejectedDocumentRemedy,
  WITHOUT_CREDIT_NOTES,
} from "./test-support/rejected-document-remedy-fixtures.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const ATTEMPTED_AT = new Date("2026-10-16T12:00:00.000Z");
const REJECTIONS = [{ code: 10016, message: "Fictional observation" }];

let testDatabase: TestDatabase;
let db: TestDatabase["db"];

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  await seedOfflinePointOfSale(db);
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

function rejectThree(fortnight = OCTOBER_FIRST_HALF) {
  return new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(
    { pointOfSaleNumber: 8, fortnight },
    (report) =>
      report.recordDocumentType({
        documentType: "factura_c",
        state: "refused",
        at: ATTEMPTED_AT,
        reportedThrough: 2,
        rejectedNumber: 3,
        rejections: REJECTIONS,
      }),
  );
}

describe("recordedDocumentTypeReports", () => {
  it("reads nothing for a presentation without document type reports", async () => {
    expect(await recordedDocumentTypeReports(db, 8, OCTOBER_FIRST_HALF)).toEqual([]);
  });

  it("reads the report of each document type of the presentation with the remedy recorded for its rejection", async () => {
    await rejectThree();
    await rejectThree(OCTOBER_SECOND_HALF);
    await insertRejectedDocumentRemedy(db, {
      pointOfSale: 8,
      fortnight: OCTOBER_FIRST_HALF,
      number: 3,
      correction: null,
      rejectedAt: ATTEMPTED_AT,
      recordedAt: new Date("2026-10-17T12:00:00.000Z"),
    });

    expect(await recordedDocumentTypeReports(db, 8, OCTOBER_FIRST_HALF)).toEqual([
      {
        documentType: "factura_c",
        state: "refused",
        reportedThrough: 2,
        rejectedNumber: 3,
        lastAttemptAt: ATTEMPTED_AT,
        rejections: REJECTIONS,
        remedy: { number: 3, rejectedAt: ATTEMPTED_AT },
      },
    ]);
  });

  it("reads no rejections and no remedy for a document type that rejected no document", async () => {
    await new DrizzleFortnightReportStore(db, WITHOUT_CREDIT_NOTES).holdReport(
      { pointOfSaleNumber: 8, fortnight: OCTOBER_FIRST_HALF },
      (report) =>
        report.recordDocumentType({
          documentType: "factura_c",
          state: "accepted",
          at: ATTEMPTED_AT,
          reportedThrough: 5,
        }),
    );

    expect(await recordedDocumentTypeReports(db, 8, OCTOBER_FIRST_HALF)).toEqual([
      expect.objectContaining({ rejectedNumber: null, rejections: [], remedy: null }),
    ]);
  });

  it("reads the reports of a point of sale only for the branch its register belongs to, when a branch is named", async () => {
    await rejectThree();
    const ownBranch = await seededLocationId(db);
    const [otherBranch] = await db.insert(locations).values({}).returning({ id: locations.id });
    await db.update(registers).set({ locationId: otherBranch?.id as string });

    expect(await recordedDocumentTypeReports(db, 8, OCTOBER_FIRST_HALF, ownBranch)).toEqual([]);
    expect(
      await recordedDocumentTypeReports(db, 8, OCTOBER_FIRST_HALF, otherBranch?.id as string),
    ).toHaveLength(1);
    expect(await recordedDocumentTypeReports(db, 8, OCTOBER_FIRST_HALF)).toHaveLength(1);
  });
});

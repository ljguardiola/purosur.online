import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { recordedRemedies, remedyKey } from "./drizzle-rejected-document-remedies.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";
import { insertRejectedDocumentRemedy } from "./test-support/rejected-document-remedy-fixtures.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const REJECTED_AT = new Date("2026-10-16T12:00:00.000Z");

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
});

function remedy(
  overrides: Partial<Parameters<typeof insertRejectedDocumentRemedy>[1]> & { recordedAt: Date },
) {
  return insertRejectedDocumentRemedy(db, {
    pointOfSale: 8,
    fortnight: OCTOBER_FIRST_HALF,
    number: 3,
    correction: null,
    rejectedAt: REJECTED_AT,
    ...overrides,
  });
}

const rejectionOfThree = {
  pointOfSale: 8,
  fortnightStart: OCTOBER_FIRST_HALF.start,
  documentType: "factura_c",
  rejectedNumber: 3,
  lastAttemptAt: REJECTED_AT,
};

describe("recordedRemedies", () => {
  it("keeps as the correction in force the one of the newest corrected remedy, which a remedy that only reports the document again leaves in place", async () => {
    await remedy({ correction: { total: 100 }, recordedAt: new Date("2026-10-17T10:00:00.000Z") });
    await remedy({ correction: { total: 200 }, recordedAt: new Date("2026-10-17T11:00:00.000Z") });
    await remedy({ correction: null, recordedAt: new Date("2026-10-17T12:00:00.000Z") });

    const { corrections } = await recordedRemedies(db, { pointsOfSale: [8] });

    expect([...corrections]).toEqual([
      [remedyKey(8, OCTOBER_FIRST_HALF.start, "factura_c", 3), { total: 200 }],
    ]);
  });

  it("answers the remedy recorded for a rejection by the instant of that rejection, whenever it was recorded", async () => {
    await remedy({ recordedAt: new Date("2026-10-17T10:00:00.000Z") });
    await remedy({
      rejectedAt: new Date("2026-10-15T12:00:00.000Z"),
      recordedAt: new Date("2026-10-18T10:00:00.000Z"),
    });

    const { remedyOf } = await recordedRemedies(db, { pointsOfSale: [8] });

    expect(remedyOf(rejectionOfThree)).toEqual({ number: 3, rejectedAt: REJECTED_AT });
    expect(
      remedyOf({ ...rejectionOfThree, lastAttemptAt: new Date("2026-10-19T12:00:00.000Z") }),
    ).toBeNull();
  });

  it("answers a remedy recorded for a rejection never attempted only for such a rejection", async () => {
    await remedy({ rejectedAt: null, recordedAt: new Date("2026-10-17T10:00:00.000Z") });

    const { remedyOf } = await recordedRemedies(db, { pointsOfSale: [8] });

    expect(remedyOf({ ...rejectionOfThree, lastAttemptAt: null })).toEqual({
      number: 3,
      rejectedAt: null,
    });
    expect(remedyOf(rejectionOfThree)).toBeNull();
  });

  it("answers no remedy for a refusal that rejected no document, nor for another number", async () => {
    await remedy({ recordedAt: new Date("2026-10-17T10:00:00.000Z") });

    const { remedyOf } = await recordedRemedies(db, { pointsOfSale: [8] });

    expect(remedyOf({ ...rejectionOfThree, rejectedNumber: null })).toBeNull();
    expect(remedyOf({ ...rejectionOfThree, rejectedNumber: 4 })).toBeNull();
  });

  it("reads only the remedies of the points of sale asked for, and of the fortnight when one is named", async () => {
    await remedy({ correction: { total: 100 }, recordedAt: new Date("2026-10-17T10:00:00.000Z") });
    await remedy({
      fortnight: OCTOBER_SECOND_HALF,
      correction: { total: 200 },
      recordedAt: new Date("2026-10-17T11:00:00.000Z"),
    });
    await remedy({
      pointOfSale: 7,
      correction: { total: 300 },
      recordedAt: new Date("2026-10-17T12:00:00.000Z"),
    });

    const ofFortnight = await recordedRemedies(db, {
      pointsOfSale: [8],
      fortnightStart: OCTOBER_FIRST_HALF.start,
    });
    const ofPointOfSale = await recordedRemedies(db, { pointsOfSale: [8] });
    const ofNone = await recordedRemedies(db, { pointsOfSale: [] });

    expect([...ofFortnight.corrections.values()]).toEqual([{ total: 100 }]);
    expect([...ofPointOfSale.corrections.values()]).toEqual([{ total: 100 }, { total: 200 }]);
    expect(ofNone.corrections.size).toBe(0);
    expect(ofNone.remedyOf(rejectionOfThree)).toBeNull();
  });
});

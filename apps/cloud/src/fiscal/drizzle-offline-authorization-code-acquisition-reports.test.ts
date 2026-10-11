import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { offlineAuthorizationCodeAcquisitionReports } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleOfflineAuthorizationCodeAcquisitionReports } from "./drizzle-offline-authorization-code-acquisition-reports.js";

const FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const NOW = new Date("2026-10-13T15:00:00.000Z");

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

function newReports() {
  return new DrizzleOfflineAuthorizationCodeAcquisitionReports(testDatabase.db, { now: () => NOW });
}

describe("DrizzleOfflineAuthorizationCodeAcquisitionReports", () => {
  it("accepts the first report of a fortnight and outcome kind and keeps when it was made", async () => {
    await expect(newReports().recordFirstReport(SECOND_HALF, "refused")).resolves.toBe(true);

    expect(await testDatabase.db.select().from(offlineAuthorizationCodeAcquisitionReports)).toEqual(
      [{ fortnightStart: "2026-10-16", outcomeKind: "refused", reportedAt: NOW }],
    );
  });

  it("refuses a second report of the same fortnight and outcome kind", async () => {
    await newReports().recordFirstReport(SECOND_HALF, "refused");

    await expect(newReports().recordFirstReport(SECOND_HALF, "refused")).resolves.toBe(false);

    expect(
      await testDatabase.db.select().from(offlineAuthorizationCodeAcquisitionReports),
    ).toHaveLength(1);
  });

  it("accepts another outcome kind of the same fortnight and the same kind of another fortnight", async () => {
    await newReports().recordFirstReport(SECOND_HALF, "refused");

    await expect(newReports().recordFirstReport(SECOND_HALF, "no_answer")).resolves.toBe(true);
    await expect(newReports().recordFirstReport(FIRST_HALF, "refused")).resolves.toBe(true);
  });

  it("lets only one of two concurrent first reports win", async () => {
    const results = await Promise.all([
      newReports().recordFirstReport(SECOND_HALF, "not_recovered"),
      newReports().recordFirstReport(SECOND_HALF, "not_recovered"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

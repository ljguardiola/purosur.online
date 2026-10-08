import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaInvoicingEvidence } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleInvoicingEvidence } from "./drizzle-invoicing-evidence.js";

const EARLIER = new Date("2026-10-06T15:00:00.000Z");
const LATER = new Date("2026-10-06T15:00:30.000Z");

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

async function recordedTimes() {
  const rows = await testDatabase.db.select().from(arcaInvoicingEvidence);
  return rows.map((row) => row.lastCallOkAt);
}

describe("DrizzleInvoicingEvidence", () => {
  it("keeps the time of a successful invoicing call", async () => {
    await new DrizzleInvoicingEvidence(testDatabase.db).recordInvoicingCallOk(EARLIER);

    expect(await recordedTimes()).toEqual([EARLIER]);
  });

  it("keeps only the latest time, however the calls are recorded", async () => {
    const evidence = new DrizzleInvoicingEvidence(testDatabase.db);

    await evidence.recordInvoicingCallOk(LATER);
    await evidence.recordInvoicingCallOk(EARLIER);

    expect(await recordedTimes()).toEqual([LATER]);
  });

  it("moves forward to a later call", async () => {
    const evidence = new DrizzleInvoicingEvidence(testDatabase.db);

    await evidence.recordInvoicingCallOk(EARLIER);
    await evidence.recordInvoicingCallOk(LATER);

    expect(await recordedTimes()).toEqual([LATER]);
  });
});

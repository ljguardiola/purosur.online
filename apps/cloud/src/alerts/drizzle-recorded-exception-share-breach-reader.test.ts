import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DrizzleExceptionShareBreachStore } from "../fiscal/drizzle-exception-share-breach-store.js";
import { insertFiscalAddress } from "../fiscal/test-support/exception-share-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRecordedExceptionShareBreachReader } from "./drizzle-recorded-exception-share-breach-reader.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");

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
});

describe("DrizzleRecordedExceptionShareBreachReader.recordedBreaches", () => {
  it("answers nothing while no breach was recorded", async () => {
    await expect(
      new DrizzleRecordedExceptionShareBreachReader(db).recordedBreaches(),
    ).resolves.toEqual([]);
  });

  it("answers every recorded breach with the name of its fiscal address, the earliest month first", async () => {
    const central = await insertFiscalAddress(db, "Depósito Central");
    const north = await insertFiscalAddress(db, "Local Norte");
    await new DrizzleExceptionShareBreachStore(db, () => NOW).transaction(async (transaction) => {
      await transaction.recordBreach({
        fiscalAddressId: central,
        month: "2026-09",
        exceptionCount: 2,
        totalCount: 20,
      });
      await transaction.recordBreach({
        fiscalAddressId: north,
        month: "2025-11",
        exceptionCount: 1,
        totalCount: 10,
      });
    });

    await expect(
      new DrizzleRecordedExceptionShareBreachReader(db).recordedBreaches(),
    ).resolves.toEqual([
      {
        fiscalAddressId: north,
        fiscalAddressName: "Local Norte",
        month: "2025-11",
        exceptionCount: 1,
        totalCount: 10,
      },
      {
        fiscalAddressId: central,
        fiscalAddressName: "Depósito Central",
        month: "2026-09",
        exceptionCount: 2,
        totalCount: 20,
      },
    ]);
  });
});

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { taxAuthorityLastAuthorizedNumbers } from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleTaxAuthorityCounts } from "./drizzle-tax-authority-counts.js";
import { insertRegisterWithPointOfSale } from "./test-support/authorization-request-fixtures.js";

const READ_AT = new Date("2026-10-06T15:00:00.000Z");
const LATER = new Date("2026-10-06T16:00:00.000Z");

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

async function storedCount(pointOfSale: number) {
  const [row] = await db
    .select()
    .from(taxAuthorityLastAuthorizedNumbers)
    .where(eq(taxAuthorityLastAuthorizedNumbers.pointOfSaleNumber, pointOfSale));
  return row;
}

describe("DrizzleTaxAuthorityCounts", () => {
  it("keeps the number the tax authority last authorized for a point of sale, and when it was read", async () => {
    await new DrizzleTaxAuthorityCounts(db).record({
      pointOfSale: 7,
      lastAuthorized: 41,
      readAt: READ_AT,
    });

    expect(await storedCount(7)).toEqual({
      pointOfSaleNumber: 7,
      lastAuthorized: 41,
      readAt: READ_AT,
    });
  });

  it("replaces the number of an earlier read", async () => {
    const counts = new DrizzleTaxAuthorityCounts(db);
    await counts.record({ pointOfSale: 7, lastAuthorized: 41, readAt: READ_AT });

    await counts.record({ pointOfSale: 7, lastAuthorized: 44, readAt: LATER });

    expect(await storedCount(7)).toEqual({
      pointOfSaleNumber: 7,
      lastAuthorized: 44,
      readAt: LATER,
    });
  });

  it("logs a change of the point of sale of the register that holds it, at its current version, so the register pulls it again", async () => {
    const registerId = await insertRegisterWithPointOfSale(db, {
      pointOfSaleNumber: 7,
      name: "caja-1",
    });
    const mark = await lastLoggedChangeSeq(db);

    await new DrizzleTaxAuthorityCounts(db).record({
      pointOfSale: 7,
      lastAuthorized: 41,
      readAt: READ_AT,
    });

    expect(await changesLoggedAfter(db, mark)).toMatchObject([
      { entity: "register_point_of_sale", entityId: registerId, version: 1, op: "update" },
    ]);
  });

  it("logs no change when no register holds the point of sale", async () => {
    await insertRegisterWithPointOfSale(db, { pointOfSaleNumber: 7, name: "caja-1" });
    const mark = await lastLoggedChangeSeq(db);

    await new DrizzleTaxAuthorityCounts(db).record({
      pointOfSale: 9,
      lastAuthorized: 5,
      readAt: READ_AT,
    });

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
    expect((await storedCount(9))?.lastAuthorized).toBe(5);
  });
});

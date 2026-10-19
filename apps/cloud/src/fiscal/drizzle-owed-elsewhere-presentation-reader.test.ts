import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleOwedElsewherePresentationReader } from "./drizzle-owed-elsewhere-presentation-reader.js";
import { DrizzleOwedPresentationList } from "./drizzle-owed-presentation-list.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const SEPTEMBER_FIRST_HALF = { start: "2026-09-01", end: "2026-09-15" };
const SEPTEMBER_SECOND_HALF = { start: "2026-09-16", end: "2026-09-30" };
const OFFLINE_POINT_OF_SALE = 8;
const AT = new Date("2026-10-16T12:00:00.000Z");

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

function listed(...entries: { pointOfSaleNumber: number; fortnight: Fortnight }[]) {
  return new DrizzleOwedPresentationList(db).replace(entries, AT);
}

function reader() {
  return new DrizzleOwedElsewherePresentationReader(db);
}

describe("DrizzleOwedElsewherePresentationReader.owedElsewhere", () => {
  it("answers nothing while the tax authority lists nothing", async () => {
    await seedOfflinePointOfSale(db);

    expect(await reader().owedElsewhere()).toEqual([]);
  });

  it("answers the presentations listed for a point of sale no register claimed", async () => {
    await seedOfflinePointOfSale(db);
    await listed({ pointOfSaleNumber: 9, fortnight: SEPTEMBER_FIRST_HALF });

    expect(await reader().owedElsewhere()).toEqual([
      { pointOfSaleNumber: 9, fortnight: SEPTEMBER_FIRST_HALF },
    ]);
  });

  it("leaves out the presentations listed for an offline point of sale of a register", async () => {
    await seedOfflinePointOfSale(db);
    await listed(
      { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight: SEPTEMBER_FIRST_HALF },
      { pointOfSaleNumber: 9, fortnight: SEPTEMBER_SECOND_HALF },
    );

    expect(await reader().owedElsewhere()).toEqual([
      { pointOfSaleNumber: 9, fortnight: SEPTEMBER_SECOND_HALF },
    ]);
  });

  it("answers the presentations listed for the real-time point of sale, which is not presented offline", async () => {
    await seedOfflinePointOfSale(db);
    await listed({ pointOfSaleNumber: 7, fortnight: SEPTEMBER_FIRST_HALF });

    expect(await reader().owedElsewhere()).toEqual([
      { pointOfSaleNumber: 7, fortnight: SEPTEMBER_FIRST_HALF },
    ]);
  });

  it("answers every presentation listed while no register claims an offline point of sale", async () => {
    await listed({ pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight: SEPTEMBER_FIRST_HALF });

    expect(await reader().owedElsewhere()).toEqual([
      { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight: SEPTEMBER_FIRST_HALF },
    ]);
  });
});

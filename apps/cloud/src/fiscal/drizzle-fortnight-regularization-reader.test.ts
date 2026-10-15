import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pointOfSaleClaims } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleFortnightRegularizationReader } from "./drizzle-fortnight-regularization-reader.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
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

async function keepCode(fortnight: Fortnight, code: string) {
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code, fortnight, reportDeadline: "2026-11-20" },
      obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
      obtainedThrough: "requested",
    }),
  );
}

async function claimedBeforeEveryFortnight() {
  await testDatabase.asMigrator(() =>
    db
      .update(pointOfSaleClaims)
      .set({ claimedAt: new Date("2026-09-20T12:00:00.000Z") })
      .where(eq(pointOfSaleClaims.pointOfSaleNumber, OFFLINE_POINT_OF_SALE)),
  );
}

function record(
  fortnight: Fortnight,
  state: "blocked" | "refused" | "accepted" | "needs_regularization",
) {
  return new DrizzleFortnightReportStore(db).holdReport(
    { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight },
    (report) => report.record({ state, at: AT }),
  );
}

function reader() {
  return new DrizzleFortnightRegularizationReader(db);
}

describe("DrizzleFortnightRegularizationReader.presentationsNeedingRegularization", () => {
  it("answers the presentation recorded as needing regularization with the register that owns its point of sale", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await record(OCTOBER_FIRST_HALF, "needs_regularization");

    await expect(reader().presentationsNeedingRegularization()).resolves.toEqual([
      {
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        registerId,
        fortnight: OCTOBER_FIRST_HALF,
      },
    ]);
  });

  it("leaves out the presentations in any other state and the ones never recorded", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013");
    await record(OCTOBER_FIRST_HALF, "accepted");

    await expect(reader().presentationsNeedingRegularization()).resolves.toEqual([]);
  });

  it("answers each presentation that needs regularization", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013");
    await record(OCTOBER_FIRST_HALF, "needs_regularization");
    await record(OCTOBER_SECOND_HALF, "needs_regularization");

    const presentations = await reader().presentationsNeedingRegularization();

    expect(presentations.map(({ fortnight }) => fortnight.start).sort()).toEqual([
      "2026-10-01",
      "2026-10-16",
    ]);
  });
});

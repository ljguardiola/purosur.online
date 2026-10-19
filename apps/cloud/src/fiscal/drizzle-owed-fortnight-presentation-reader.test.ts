import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pointOfSaleClaims } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleOwedFortnightPresentationReader } from "./drizzle-owed-fortnight-presentation-reader.js";
import { DrizzleOwedPresentationList } from "./drizzle-owed-presentation-list.js";
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

async function keepCode(fortnight: Fortnight, code: string, reportDeadline: string) {
  await new DrizzleOfflineAuthorizationCodeStore(db).holdAcquisition(fortnight, (acquisition) =>
    acquisition.keep({
      code: { code, fortnight, reportDeadline },
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

function record(fortnight: Fortnight, state: "blocked" | "refused" | "accepted") {
  return new DrizzleFortnightReportStore(db).holdReport(
    { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight },
    (report) => report.record({ state, at: AT }),
  );
}

function listedAsOwed(pointOfSaleNumber: number, fortnight: Fortnight) {
  return new DrizzleOwedPresentationList(db).replace([{ pointOfSaleNumber, fortnight }], AT);
}

function reader() {
  return new DrizzleOwedFortnightPresentationReader(db);
}

describe("DrizzleOwedFortnightPresentationReader.owedPresentations", () => {
  it("answers a closed fortnight's presentation with its register, the deadline the tax authority granted with the code and no state while nothing was recorded", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");

    expect(await reader().owedPresentations("2026-10-16")).toEqual([
      {
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        registerId,
        fortnight: OCTOBER_FIRST_HALF,
        taxAuthorityDeadline: "2026-10-20",
        state: null,
      },
    ]);
  });

  it("answers the state recorded for each presentation", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013", "2026-11-05");
    await record(OCTOBER_FIRST_HALF, "refused");

    const owed = await reader().owedPresentations("2026-11-01");

    expect(owed.map(({ fortnight, state }) => [fortnight.start, state]).sort()).toEqual([
      ["2026-10-01", "refused"],
      ["2026-10-16", null],
    ]);
  });

  it("leaves out a presentation recorded as accepted", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013", "2026-11-05");
    await record(OCTOBER_FIRST_HALF, "accepted");
    await record(OCTOBER_SECOND_HALF, "blocked");

    const owed = await reader().owedPresentations("2026-11-01");

    expect(owed.map(({ fortnight, state }) => [fortnight.start, state])).toEqual([
      ["2026-10-16", "blocked"],
    ]);
  });

  it("answers nothing for a fortnight that has not closed by the given day", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");

    expect(await reader().owedPresentations("2026-10-15")).toEqual([]);
  });
});

describe("DrizzleOwedFortnightPresentationReader.owedPresentations for the presentations the tax authority lists as owed", () => {
  it("answers a listed presentation recorded as accepted as owed again, with no state", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");
    await record(OCTOBER_FIRST_HALF, "accepted");
    await listedAsOwed(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF);

    expect(await reader().owedPresentations("2026-11-01")).toEqual([
      {
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        registerId,
        fortnight: OCTOBER_FIRST_HALF,
        taxAuthorityDeadline: "2026-10-20",
        state: null,
      },
    ]);
  });

  it("answers a listed presentation recorded in another state with that state", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");
    await record(OCTOBER_FIRST_HALF, "refused");
    await listedAsOwed(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF);

    const owed = await reader().owedPresentations("2026-11-01");

    expect(owed.map(({ state }) => state)).toEqual(["refused"]);
  });

  it("answers nothing for a listed presentation whose code is not kept yet", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await listedAsOwed(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF);

    expect(await reader().owedPresentations("2026-11-01")).toEqual([]);
  });

  it("answers nothing for a presentation listed for a point of sale the system does not own", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight();
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");
    await record(OCTOBER_FIRST_HALF, "accepted");
    await listedAsOwed(9, OCTOBER_FIRST_HALF);

    expect(await reader().owedPresentations("2026-11-01")).toEqual([]);
  });
});

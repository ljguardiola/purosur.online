import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fortnightReports, pointOfSaleClaims } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const OFFLINE_POINT_OF_SALE = 8;
const KEY = { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight: OCTOBER_FIRST_HALF };
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
      code: { code, fortnight, reportDeadline: "2026-10-20" },
      obtainedAt: new Date("2026-09-28T12:00:00.000Z"),
      obtainedThrough: "requested",
    }),
  );
}

async function claimedAt(claimedAtInstant: Date) {
  await testDatabase.asMigrator(() =>
    db
      .update(pointOfSaleClaims)
      .set({ claimedAt: claimedAtInstant })
      .where(eq(pointOfSaleClaims.pointOfSaleNumber, OFFLINE_POINT_OF_SALE)),
  );
}

function newStore() {
  return new DrizzleFortnightReportStore(db);
}

describe("DrizzleFortnightReportStore.owedReports", () => {
  it("owes a closed fortnight's kept code for each offline point of sale claimed before it closed, with its register", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(await newStore().owedReports("2026-10-16")).toEqual([
      {
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        registerId,
        code: {
          code: "36123456789012",
          fortnight: OCTOBER_FIRST_HALF,
          reportDeadline: "2026-10-20",
        },
      },
    ]);
  });

  it("owes nothing for the real-time point of sale", async () => {
    await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(
      (await newStore().owedReports("2026-10-16")).map(
        ({ pointOfSaleNumber }) => pointOfSaleNumber,
      ),
    ).toEqual([OFFLINE_POINT_OF_SALE]);
  });

  it("owes nothing for a fortnight that has not closed by the given day", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(await newStore().owedReports("2026-10-15")).toEqual([]);
  });

  it("owes nothing for a point of sale claimed after the fortnight closed", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-10-16T03:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(await newStore().owedReports("2026-10-17")).toEqual([]);
  });

  it("owes a point of sale claimed before the close even in the last hours of the fortnight", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-10-16T02:59:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");

    expect(await newStore().owedReports("2026-10-17")).toHaveLength(1);
  });

  it("owes each closed fortnight's code separately", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013");

    const owed = await newStore().owedReports("2026-11-01");

    expect(owed.map(({ code }) => code.code).sort()).toEqual(["36123456789012", "36123456789013"]);
  });

  it("stops owing a presentation recorded as accepted but keeps owing one in any other state", async () => {
    await seedOfflinePointOfSale(db);
    await claimedAt(new Date("2026-09-20T12:00:00.000Z"));
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013");
    const store = newStore();
    await store.holdReport(KEY, (report) => report.record({ state: "accepted", at: AT }));
    await store.holdReport(
      { pointOfSaleNumber: OFFLINE_POINT_OF_SALE, fortnight: OCTOBER_SECOND_HALF },
      (report) => report.record({ state: "blocked", at: AT }),
    );

    const owed = await store.owedReports("2026-11-01");

    expect(owed.map(({ code }) => code.code)).toEqual(["36123456789013"]);
  });
});

describe("DrizzleFortnightReportStore.holdReport", () => {
  beforeEach(async () => {
    await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012");
  });

  it("recalls nothing for a presentation that was never recorded", async () => {
    expect(await newStore().holdReport(KEY, (report) => report.recorded())).toBeNull();
  });

  it("returns what the work returned", async () => {
    expect(await newStore().holdReport(KEY, async () => "worked")).toBe("worked");
  });

  it("records a blocked presentation without an attempt time", async () => {
    await newStore().holdReport(KEY, (report) => report.record({ state: "blocked", at: AT }));

    expect(await newStore().holdReport(KEY, (report) => report.recorded())).toEqual({
      state: "blocked",
      lastAttemptAt: null,
    });
  });

  it.each(["submitting", "refused", "accepted"] as const)(
    "takes the time of a %s change as the time of the last attempt",
    async (state) => {
      await newStore().holdReport(KEY, (report) => report.record({ state, at: AT }));

      expect(await newStore().holdReport(KEY, (report) => report.recorded())).toEqual({
        state,
        lastAttemptAt: AT,
      });
    },
  );

  it("keeps the time of the last attempt when a later change is not an attempt", async () => {
    const store = newStore();
    const later = new Date("2026-10-16T15:00:00.000Z");
    await store.holdReport(KEY, async (report) => {
      await report.record({ state: "refused", at: AT });
      await report.record({ state: "blocked", at: later });
    });

    expect(await store.holdReport(KEY, (report) => report.recorded())).toEqual({
      state: "blocked",
      lastAttemptAt: AT,
    });
  });

  it("keeps the rejections of a refusal with the change's time, and clears them once accepted", async () => {
    const store = newStore();
    const rejections = [{ code: 1202, message: "Fictional rejection" }];

    await store.holdReport(KEY, (report) =>
      report.record({ state: "refused", at: AT, rejections }),
    );
    expect(await db.select().from(fortnightReports)).toEqual([
      {
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        fortnightStart: "2026-10-01",
        fortnightEnd: "2026-10-15",
        state: "refused",
        lastAttemptAt: AT,
        rejections,
        recordedAt: AT,
      },
    ]);

    const accepted = new Date("2026-10-16T14:00:00.000Z");
    await store.holdReport(KEY, (report) => report.record({ state: "accepted", at: accepted }));
    expect(await db.select().from(fortnightReports)).toEqual([
      expect.objectContaining({ state: "accepted", rejections: null, recordedAt: accepted }),
    ]);
  });
});

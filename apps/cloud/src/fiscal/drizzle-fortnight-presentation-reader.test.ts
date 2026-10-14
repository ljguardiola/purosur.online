import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { locations, pointOfSaleClaims, registers, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleFortnightPresentationReader } from "./drizzle-fortnight-presentation-reader.js";
import { DrizzleFortnightReportStore } from "./drizzle-fortnight-report-store.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { seedOfflinePointOfSale } from "./test-support/offline-point-of-sale-fixtures.js";

const OCTOBER_FIRST_HALF = { start: "2026-10-01", end: "2026-10-15" };
const OCTOBER_SECOND_HALF = { start: "2026-10-16", end: "2026-10-31" };
const OFFLINE_POINT_OF_SALE = 8;
const AT = new Date("2026-11-01T12:00:00.000Z");

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

async function claimedBeforeEveryFortnight(pointOfSaleNumber: number) {
  await testDatabase.asMigrator(() =>
    db
      .update(pointOfSaleClaims)
      .set({ claimedAt: new Date("2026-09-20T12:00:00.000Z") })
      .where(eq(pointOfSaleClaims.pointOfSaleNumber, pointOfSaleNumber)),
  );
}

function record(pointOfSaleNumber: number, fortnight: Fortnight, state: "blocked" | "accepted") {
  return new DrizzleFortnightReportStore(db).holdReport(
    { pointOfSaleNumber, fortnight },
    (report) => report.record({ state, at: AT }),
  );
}

async function seedOtherBranchOfflinePointOfSale(pointOfSaleNumber: number) {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Eva Lopez", email: "eva@example.com", locationId: location.id })
    .returning({ id: users.id });
  const [register] = await db
    .insert(registers)
    .values({ locationId: location.id, name: "Caja 9" })
    .returning({ id: registers.id });
  if (!actor || !register) {
    throw new Error("test setup: seeding the other branch's register returned no row");
  }
  await db.insert(pointOfSaleClaims).values({
    pointOfSaleNumber,
    registerId: register.id,
    mechanism: "offline",
    claimedBy: actor.id,
  });
  await claimedBeforeEveryFortnight(pointOfSaleNumber);
}

async function presentations(today: string) {
  return new DrizzleFortnightPresentationReader(db).branchPresentations(
    await seededLocationId(db),
    today,
  );
}

describe("DrizzleFortnightPresentationReader.branchPresentations", () => {
  it("answers a closed fortnight with its register, its point of sale, no state while nothing was recorded and the deadline the domain sets", async () => {
    const registerId = await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight(OFFLINE_POINT_OF_SALE);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");

    expect(await presentations("2026-10-16")).toEqual([
      {
        registerId,
        pointOfSaleNumber: OFFLINE_POINT_OF_SALE,
        fortnight: OCTOBER_FIRST_HALF,
        deadline: "2026-10-20",
        state: null,
      },
    ]);
  });

  it("caps the deadline at the eighth day after the fortnight closes when the tax authority granted a later one", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight(OFFLINE_POINT_OF_SALE);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-11-30");

    const [presentation] = await presentations("2026-10-16");

    expect(presentation?.deadline).toBe("2026-10-23");
  });

  it("lists accepted presentations with their state, newest fortnight first", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight(OFFLINE_POINT_OF_SALE);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013", "2026-11-05");
    await record(OFFLINE_POINT_OF_SALE, OCTOBER_FIRST_HALF, "accepted");
    await record(OFFLINE_POINT_OF_SALE, OCTOBER_SECOND_HALF, "blocked");

    const listed = await presentations("2026-11-01");

    expect(listed.map(({ fortnight, state }) => [fortnight.start, state])).toEqual([
      ["2026-10-16", "blocked"],
      ["2026-10-01", "accepted"],
    ]);
  });

  it("orders the presentations of one fortnight by point of sale number", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight(OFFLINE_POINT_OF_SALE);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");
    const locationId = await seededLocationId(db);
    const [actor] = await db.select({ id: users.id }).from(users);
    const [register] = await db
      .insert(registers)
      .values({ locationId, name: "Caja 2" })
      .returning({ id: registers.id });
    if (!actor || !register) {
      throw new Error("test setup: seeding the second register returned no row");
    }
    await db.insert(pointOfSaleClaims).values({
      pointOfSaleNumber: 3,
      registerId: register.id,
      mechanism: "offline",
      claimedBy: actor.id,
    });
    await claimedBeforeEveryFortnight(3);

    const listed = await presentations("2026-10-16");

    expect(listed.map(({ pointOfSaleNumber }) => pointOfSaleNumber)).toEqual([
      3,
      OFFLINE_POINT_OF_SALE,
    ]);
  });

  it("answers nothing for a point of sale claimed after the fortnight closed or a fortnight that has not closed", async () => {
    await seedOfflinePointOfSale(db);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");
    await keepCode(OCTOBER_SECOND_HALF, "36123456789013", "2026-11-05");

    expect(await presentations("2026-10-16")).toEqual([]);

    await claimedBeforeEveryFortnight(OFFLINE_POINT_OF_SALE);

    expect(await presentations("2026-10-15")).toEqual([]);
  });

  it("leaves out the presentations of another branch's registers", async () => {
    await seedOfflinePointOfSale(db);
    await claimedBeforeEveryFortnight(OFFLINE_POINT_OF_SALE);
    await seedOtherBranchOfflinePointOfSale(21);
    await keepCode(OCTOBER_FIRST_HALF, "36123456789012", "2026-10-20");

    const listed = await presentations("2026-10-16");

    expect(listed.map(({ pointOfSaleNumber }) => pointOfSaleNumber)).toEqual([
      OFFLINE_POINT_OF_SALE,
    ]);
  });
});

import { compareCodeUnits } from "@purosur/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertEnrolledInstallation } from "../installation/test-support/enrolled-installation.js";
import { registers } from "../platform/db/schema.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleCashRoundingReportReader } from "./drizzle-cash-rounding-report-reader.js";
import {
  applyCancelledSale,
  applyCompletedSale,
  applyVoidedSale,
} from "./test-support/applied-sales.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const MOMENT = new Date("2026-10-06T14:00:00.000Z");
const wholeOctober = { from: "2026-10-01", to: "2026-10-31" };

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

const reader = () => new DrizzleCashRoundingReportReader(db);

async function aRegister(name: string, locationId?: string) {
  if (locationId === undefined) {
    return insertEnrolledInstallation(db, { now: NOW, registerName: name });
  }
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return insertEnrolledInstallation(db, { now: NOW, existingRegisterId: register.id });
}

const sell = (deviceId: string, cashRounding: number, completedAt = MOMENT) =>
  applyCompletedSale(db, { deviceId, completedAt, total: 3_200, overrides: { cashRounding } });

describe("DrizzleCashRoundingReportReader.completedCashRoundings", () => {
  it("adds up the rounding and counts the rounded sales of each register on each day", async () => {
    const first = await aRegister("Caja 1");
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await sell(first.deviceId, 70);
    await sell(first.deviceId, 30, new Date("2026-10-06T18:00:00.000Z"));
    await sell(second.deviceId, 90);
    await sell(first.deviceId, 50, new Date("2026-10-05T14:00:00.000Z"));

    const rows = await reader().completedCashRoundings({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(
      [...rows].sort(
        (a, b) =>
          compareCodeUnits(a.day, b.day) || compareCodeUnits(a.registerName, b.registerName),
      ),
    ).toEqual([
      {
        day: "2026-10-05",
        registerId: first.registerId,
        registerName: "Caja 1",
        rounded: 50,
        roundedSaleCount: 1,
      },
      {
        day: "2026-10-06",
        registerId: first.registerId,
        registerName: "Caja 1",
        rounded: 100,
        roundedSaleCount: 2,
      },
      {
        day: "2026-10-06",
        registerId: second.registerId,
        registerName: "Caja 2",
        rounded: 90,
        roundedSaleCount: 1,
      },
    ]);
  });

  it("does not count sales without rounding", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sell(deviceId, 0);
    await sell(deviceId, 40);

    const rows = await reader().completedCashRoundings({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows.map((row) => [row.rounded, row.roundedSaleCount])).toEqual([[40, 1]]);
  });

  it("leaves out the rounding of voided and cancelled sales", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await applyVoidedSale(db, {
      deviceId,
      completedAt: MOMENT,
      voidedAt: new Date("2026-10-06T15:00:00.000Z"),
      completed: { cashRounding: 80 },
    });
    await applyCancelledSale(db, { deviceId, cancelledAt: MOMENT, total: 900 });
    await sell(deviceId, 20);

    const rows = await reader().completedCashRoundings({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows.map((row) => [row.rounded, row.roundedSaleCount])).toEqual([[20, 1]]);
  });

  it("dates a sale by the Argentina calendar day it was completed and leaves out the days outside the range", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await sell(deviceId, 1, new Date("2026-10-05T02:59:00.000Z"));
    await sell(deviceId, 20, new Date("2026-10-05T03:00:00.000Z"));
    await sell(deviceId, 30, new Date("2026-10-07T02:59:00.000Z"));
    await sell(deviceId, 40, new Date("2026-10-07T03:00:00.000Z"));

    const rows = await reader().completedCashRoundings({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(rows.map((row) => [row.day, row.rounded])).toEqual(
      expect.arrayContaining([
        ["2026-10-05", 20],
        ["2026-10-06", 30],
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("limits the report to the asked register", async () => {
    const first = await aRegister("Caja 1");
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await sell(first.deviceId, 70);
    await sell(second.deviceId, 25);

    const rows = await reader().completedCashRoundings({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(rows.map((row) => [row.registerName, row.rounded])).toEqual([["Caja 2", 25]]);
  });

  it("never shows the sales of another branch, not even by asking for its register", async () => {
    const own = await aRegister("Caja 1");
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    await sell(own.deviceId, 10);
    await sell(other.deviceId, 90);

    const ofTheBranch = await reader().completedCashRoundings({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().completedCashRoundings({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch.map((row) => row.rounded)).toEqual([10]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("reports nothing for a range without rounding", async () => {
    const { locationId } = await aRegister("Caja 1");

    const rows = await reader().completedCashRoundings({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([]);
  });
});

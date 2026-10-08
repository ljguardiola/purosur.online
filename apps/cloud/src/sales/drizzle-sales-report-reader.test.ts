import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { insertInboxEvent } from "../sync/test-support/inbox-events.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleSalesReportReader } from "./drizzle-sales-report-reader.js";
import { applyCompletedSale } from "./test-support/applied-sales.js";

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

const reader = () => new DrizzleSalesReportReader(db);

const wholeOctober = { from: "2026-10-01", to: "2026-10-31" };

describe("DrizzleSalesReportReader.completedSalesByDay", () => {
  it("counts and adds up the sales of each Argentina calendar day, the earliest day first", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-06T14:00:00.000Z"),
      total: 4_800,
    });
    await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-06T18:30:00.000Z"),
      total: 1_200,
    });
    await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-04T13:00:00.000Z"),
      total: 9_000,
    });

    const days = await reader().completedSalesByDay({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(days).toEqual([
      { day: "2026-10-04", salesCount: 1, total: 9_000 },
      { day: "2026-10-06", salesCount: 2, total: 6_000 },
    ]);
  });

  it("puts a sale made at 23:30 in Argentina on that day, though it is already the next day in UTC", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await applyCompletedSale(db, {
      deviceId,
      completedAt: new Date("2026-10-06T02:30:00.000Z"),
      total: 3_000,
    });

    const days = await reader().completedSalesByDay({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(days).toEqual([{ day: "2026-10-05", salesCount: 1, total: 3_000 }]);
  });

  it("includes the first and last Argentina day of the range and nothing outside it", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    const sold = async (completedAt: string, total: number) =>
      applyCompletedSale(db, { deviceId, completedAt: new Date(completedAt), total });
    await sold("2026-10-05T02:59:00.000Z", 1);
    await sold("2026-10-05T03:00:00.000Z", 20);
    await sold("2026-10-07T02:59:00.000Z", 300);
    await sold("2026-10-07T03:00:00.000Z", 4_000);

    const days = await reader().completedSalesByDay({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(days).toEqual([
      { day: "2026-10-05", salesCount: 1, total: 20 },
      { day: "2026-10-06", salesCount: 1, total: 300 },
    ]);
  });

  it("limits the days to the sales of the asked register", async () => {
    const first = await aRegister("Caja 1");
    const second = await insertEnrolledInstallation(db, {
      now: NOW,
      registerName: "Caja 2",
    });
    const moment = new Date("2026-10-06T14:00:00.000Z");
    await applyCompletedSale(db, { deviceId: first.deviceId, completedAt: moment, total: 1_000 });
    await applyCompletedSale(db, { deviceId: second.deviceId, completedAt: moment, total: 250 });

    const days = await reader().completedSalesByDay({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(days).toEqual([{ day: "2026-10-06", salesCount: 1, total: 250 }]);
  });

  it("never shows the sales of another branch, not even by asking for its register", async () => {
    const own = await aRegister("Caja 1");
    const otherLocationId = await insertLocation(db);
    const other = await aRegister("Caja 1", otherLocationId);
    const moment = new Date("2026-10-06T14:00:00.000Z");
    await applyCompletedSale(db, { deviceId: own.deviceId, completedAt: moment, total: 1_000 });
    await applyCompletedSale(db, { deviceId: other.deviceId, completedAt: moment, total: 7_000 });

    const ofTheBranch = await reader().completedSalesByDay({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().completedSalesByDay({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch).toEqual([{ day: "2026-10-06", salesCount: 1, total: 1_000 }]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("shows nothing for a sale whose event was received but not applied", async () => {
    const { deviceId, locationId } = await aRegister("Caja 1");
    await insertInboxEvent(db, deviceId, {
      eventType: "sale_completed",
      occurredAt: new Date("2026-10-06T14:00:00.000Z"),
    });

    const days = await reader().completedSalesByDay({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(days).toEqual([]);
  });
});

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers, sales, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleCashierSalesReportReader } from "./drizzle-cashier-sales-report-reader.js";
import { applyCancelledSale, applyCompletedSale } from "./test-support/applied-sales.js";

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

const reader = () => new DrizzleCashierSalesReportReader(db);

async function aRegister(name = "Caja 1", locationId?: string) {
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

async function aUser(firstName: string, locationId: string): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({ id, firstName, email: `${id}@example.com`, locationId });
  return id;
}

async function soldBy(
  actorId: string,
  deviceId: string,
  total: number,
  options: { completedAt?: Date; inOpenSession?: string } = {},
) {
  return applyCompletedSale(db, {
    deviceId,
    completedAt: options.completedAt ?? MOMENT,
    total,
    inOpenSession: options.inOpenSession,
    overrides: { actorId, lines: [] },
  });
}

async function sessionOf(saleId: string): Promise<string> {
  const [sale] = await db
    .select({ sessionId: sales.sessionId })
    .from(sales)
    .where(eq(sales.id, saleId));
  if (!sale) {
    throw new Error("test setup: the applied sale is missing");
  }
  return sale.sessionId;
}

function byCashier<T extends { cashierId: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.cashierId < b.cashierId ? -1 : 1));
}

describe("DrizzleCashierSalesReportReader.completedSalesByCashier", () => {
  it("counts and adds up the sales of each cashier, named by the user they are", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    const beto = await aUser("Beto", locationId);
    await soldBy(ana, deviceId, 4_800);
    await soldBy(ana, deviceId, 1_200);
    await soldBy(beto, deviceId, 9_000);

    const rows = await reader().completedSalesByCashier({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(byCashier(rows)).toEqual(
      byCashier([
        { cashierId: ana, name: "Ana", sessions: 2, salesCount: 2, total: 6_000 },
        { cashierId: beto, name: "Beto", sessions: 1, salesCount: 1, total: 9_000 },
      ]),
    );
  });

  it("counts a session once however many sales the cashier made in it", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    const first = await soldBy(ana, deviceId, 1_000);
    const session = await sessionOf(first);
    await soldBy(ana, deviceId, 2_000, { inOpenSession: session });
    await soldBy(ana, deviceId, 4_000);

    const rows = await reader().completedSalesByCashier({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([
      { cashierId: ana, name: "Ana", sessions: 2, salesCount: 3, total: 7_000 },
    ]);
  });

  it("counts a session once for each cashier who sold in it", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    const beto = await aUser("Beto", locationId);
    const first = await soldBy(ana, deviceId, 1_000);
    await soldBy(beto, deviceId, 2_000, { inOpenSession: await sessionOf(first) });

    const rows = await reader().completedSalesByCashier({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows.map((row) => row.sessions)).toEqual([1, 1]);
  });

  it("reports a cashier no user matches without a name", async () => {
    const { deviceId, locationId } = await aRegister();
    const stranger = randomUUID();
    await soldBy(stranger, deviceId, 3_000);

    const rows = await reader().completedSalesByCashier({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([
      { cashierId: stranger, name: null, sessions: 1, salesCount: 1, total: 3_000 },
    ]);
  });

  it("leaves out cancelled sales", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    await soldBy(ana, deviceId, 800);
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: MOMENT,
      total: 9_000,
      overrides: { actorId: ana, lines: [] },
    });

    const rows = await reader().completedSalesByCashier({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([{ cashierId: ana, name: "Ana", sessions: 1, salesCount: 1, total: 800 }]);
  });

  it("dates a sale by the Argentina calendar day it was completed", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    const at = (completedAt: string) => ({ completedAt: new Date(completedAt) });
    await soldBy(ana, deviceId, 1, at("2026-10-05T02:59:00.000Z"));
    await soldBy(ana, deviceId, 20, at("2026-10-05T03:00:00.000Z"));
    await soldBy(ana, deviceId, 300, at("2026-10-07T02:59:00.000Z"));
    await soldBy(ana, deviceId, 4_000, at("2026-10-07T03:00:00.000Z"));

    const rows = await reader().completedSalesByCashier({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(rows).toEqual([{ cashierId: ana, name: "Ana", sessions: 2, salesCount: 2, total: 320 }]);
  });

  it("limits the report to the sales of the asked register", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const ana = await aUser("Ana", first.locationId);
    await soldBy(ana, first.deviceId, 1_000);
    await soldBy(ana, second.deviceId, 250);

    const rows = await reader().completedSalesByCashier({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(rows).toEqual([{ cashierId: ana, name: "Ana", sessions: 1, salesCount: 1, total: 250 }]);
  });

  it("never shows the sales of another branch, not even by asking for its register", async () => {
    const own = await aRegister();
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    const ana = await aUser("Ana", own.locationId);
    await soldBy(ana, own.deviceId, 1_000);
    await soldBy(ana, other.deviceId, 7_000);

    const ofTheBranch = await reader().completedSalesByCashier({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().completedSalesByCashier({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch).toEqual([
      { cashierId: ana, name: "Ana", sessions: 1, salesCount: 1, total: 1_000 },
    ]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("reports nothing for a range without sales", async () => {
    const { locationId } = await aRegister();

    const rows = await reader().completedSalesByCashier({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(rows).toEqual([]);
  });
});

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { aRemovedSaleLine } from "../sync/test-support/synced-facts.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleRemovedLinesAndCancelledSalesReportReader } from "./drizzle-removed-lines-and-cancelled-sales-report-reader.js";
import {
  applyCancelledSale,
  applyCompletedSale,
  applyRemovedSaleLine,
} from "./test-support/applied-sales.js";
import { aSoldLine } from "./test-support/sold-lines.js";

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

const reader = () => new DrizzleRemovedLinesAndCancelledSalesReportReader(db);

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

const line = (
  quantity: number,
  lineTotal: number,
  weightSource: "SCALE" | "MANUAL" | null = null,
) => aSoldLine(randomUUID(), "Queso", quantity, lineTotal, weightSource);

const query = (locationId: string, registerId?: string) => ({
  locationId,
  range: wholeOctober,
  registerId,
});

describe("DrizzleRemovedLinesAndCancelledSalesReportReader.removalFacts removed lines", () => {
  it("groups the removed lines by session, cashier and where their weight came from", async () => {
    const { deviceId, locationId } = await aRegister("Caja 7");
    const ana = await aUser("Ana", locationId);
    const first = await applyRemovedSaleLine(db, {
      deviceId,
      removedAt: MOMENT,
      overrides: {
        actorId: ana,
        line: { ...aRemovedSaleLine().line, quantity: 2, weightSource: null, lineTotal: 300 },
      },
    });
    await applyRemovedSaleLine(db, {
      deviceId,
      removedAt: MOMENT,
      inOpenSession: first.sessionId,
      overrides: {
        actorId: ana,
        line: { ...aRemovedSaleLine().line, quantity: 3, weightSource: null, lineTotal: 450 },
      },
    });
    await applyRemovedSaleLine(db, {
      deviceId,
      removedAt: MOMENT,
      inOpenSession: first.sessionId,
      overrides: {
        actorId: ana,
        line: {
          ...aRemovedSaleLine().line,
          quantity: 1_500,
          weightSource: "SCALE",
          lineTotal: 900,
        },
      },
    });

    const { removedLines } = await reader().removalFacts(query(locationId));

    const common = {
      sessionId: first.sessionId,
      registerName: "Caja 7",
      openedAt: MOMENT,
      cashierId: ana,
      cashierName: "Ana",
    };
    expect(removedLines).toHaveLength(2);
    expect(removedLines).toContainEqual({
      ...common,
      weightSource: null,
      lines: 2,
      quantity: 5,
      amount: 750,
    });
    expect(removedLines).toContainEqual({
      ...common,
      weightSource: "SCALE",
      lines: 1,
      quantity: 1_500,
      amount: 900,
    });
  });

  it("keeps the cashiers of one session apart and reports one no user matches without a name", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    const stranger = randomUUID();
    const first = await applyRemovedSaleLine(db, {
      deviceId,
      removedAt: MOMENT,
      overrides: { actorId: ana },
    });
    await applyRemovedSaleLine(db, {
      deviceId,
      removedAt: MOMENT,
      inOpenSession: first.sessionId,
      overrides: { actorId: stranger },
    });

    const { removedLines } = await reader().removalFacts(query(locationId));

    expect(removedLines.map((group) => [group.cashierId, group.cashierName]).sort()).toEqual(
      [
        [ana, "Ana"],
        [stranger, null],
      ].sort(),
    );
  });

  it("counts a removed line whose sale never arrived", async () => {
    const { deviceId, locationId } = await aRegister();

    await applyRemovedSaleLine(db, { deviceId, removedAt: MOMENT });

    const { removedLines } = await reader().removalFacts(query(locationId));

    expect(removedLines).toMatchObject([{ lines: 1 }]);
  });

  it("dates a removal by the Argentina calendar day it happened", async () => {
    const { deviceId, locationId } = await aRegister();
    const at = (removedAt: string) => ({ deviceId, removedAt: new Date(removedAt) });
    await applyRemovedSaleLine(db, at("2026-10-05T02:59:00.000Z"));
    await applyRemovedSaleLine(db, at("2026-10-05T03:00:00.000Z"));
    await applyRemovedSaleLine(db, at("2026-10-07T02:59:00.000Z"));
    await applyRemovedSaleLine(db, at("2026-10-07T03:00:00.000Z"));

    const { removedLines } = await reader().removalFacts({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(removedLines.reduce((sum, group) => sum + group.lines, 0)).toBe(2);
  });

  it("limits the removed lines to the asked register and never shows another branch", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    await applyRemovedSaleLine(db, { deviceId: first.deviceId, removedAt: MOMENT });
    await applyRemovedSaleLine(db, { deviceId: second.deviceId, removedAt: MOMENT });
    await applyRemovedSaleLine(db, { deviceId: other.deviceId, removedAt: MOMENT });

    const ofTheBranch = await reader().removalFacts(query(first.locationId));
    const ofTheSecond = await reader().removalFacts(query(first.locationId, second.registerId));
    const ofAnotherBranchsRegister = await reader().removalFacts(
      query(first.locationId, other.registerId),
    );

    expect(ofTheBranch.removedLines.map((group) => group.registerName).sort()).toEqual([
      "Caja 1",
      "Caja 2",
    ]);
    expect(ofTheSecond.removedLines.map((group) => group.registerName)).toEqual(["Caja 2"]);
    expect(ofAnotherBranchsRegister.removedLines).toEqual([]);
  });
});

describe("DrizzleRemovedLinesAndCancelledSalesReportReader.removalFacts cancelled sales", () => {
  it("answers each cancelled sale with its cashier, session, total, payment states and lines", async () => {
    const { deviceId, locationId } = await aRegister("Caja 7");
    const ana = await aUser("Ana", locationId);
    const cancelled = await applyCancelledSale(db, {
      deviceId,
      cancelledAt: MOMENT,
      total: 1_200,
      overrides: {
        actorId: ana,
        lines: [line(2, 400), line(1_500, 700, "SCALE"), line(300, 100, "SCALE")],
        payments: [],
        refunds: [],
        cashMovements: [],
      },
    });

    const { cancelledSales } = await reader().removalFacts(query(locationId));

    expect(cancelledSales).toHaveLength(1);
    const [sale] = cancelledSales;
    expect(sale).toMatchObject({
      saleId: cancelled.id,
      sessionId: cancelled.sessionId,
      registerName: "Caja 7",
      openedAt: MOMENT,
      cashierId: ana,
      cashierName: "Ana",
      total: 1_200,
      paymentStates: [],
    });
    expect(sale?.lines).toHaveLength(2);
    expect(sale?.lines).toContainEqual({ weightSource: null, quantity: 2 });
    expect(sale?.lines).toContainEqual({ weightSource: "SCALE", quantity: 1_800 });
  });

  it("answers the state of every payment, approved or not, for the domain to judge", async () => {
    const { deviceId, locationId } = await aRegister();
    const base = await applyCancelledSale(db, { deviceId, cancelledAt: MOMENT, total: 100 });

    const { cancelledSales } = await reader().removalFacts(query(locationId));

    expect(cancelledSales).toMatchObject([{ saleId: base.id, paymentStates: ["APPROVED"] }]);
  });

  it("leaves out completed sales", async () => {
    const { deviceId, locationId } = await aRegister();
    await applyCompletedSale(db, { deviceId, completedAt: MOMENT, total: 100 });

    const { cancelledSales } = await reader().removalFacts(query(locationId));

    expect(cancelledSales).toEqual([]);
  });

  it("dates a cancellation by the Argentina calendar day it happened", async () => {
    const { deviceId, locationId } = await aRegister();
    const at = (cancelledAt: string) => ({
      deviceId,
      cancelledAt: new Date(cancelledAt),
      total: 100,
    });
    await applyCancelledSale(db, at("2026-10-05T02:59:00.000Z"));
    await applyCancelledSale(db, at("2026-10-05T03:00:00.000Z"));
    await applyCancelledSale(db, at("2026-10-07T02:59:00.000Z"));
    await applyCancelledSale(db, at("2026-10-07T03:00:00.000Z"));

    const { cancelledSales } = await reader().removalFacts({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(cancelledSales).toHaveLength(2);
  });

  it("limits the cancelled sales to the asked register and never shows another branch", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    const cancel = (deviceId: string) =>
      applyCancelledSale(db, { deviceId, cancelledAt: MOMENT, total: 100 });
    await cancel(first.deviceId);
    await cancel(second.deviceId);
    await cancel(other.deviceId);

    const ofTheBranch = await reader().removalFacts(query(first.locationId));
    const ofTheSecond = await reader().removalFacts(query(first.locationId, second.registerId));
    const ofAnotherBranchsRegister = await reader().removalFacts(
      query(first.locationId, other.registerId),
    );

    expect(ofTheBranch.cancelledSales.map((sale) => sale.registerName).sort()).toEqual([
      "Caja 1",
      "Caja 2",
    ]);
    expect(ofTheSecond.cancelledSales.map((sale) => sale.registerName)).toEqual(["Caja 2"]);
    expect(ofAnotherBranchsRegister.cancelledSales).toEqual([]);
  });

  it("reports nothing for a range without removals or cancellations", async () => {
    const { locationId } = await aRegister();

    const facts = await reader().removalFacts(query(locationId));

    expect(facts).toEqual({ removedLines: [], cancelledSales: [] });
  });
});

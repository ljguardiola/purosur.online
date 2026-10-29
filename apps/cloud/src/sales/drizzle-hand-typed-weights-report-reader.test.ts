import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers, sales, users } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleHandTypedWeightsReportReader } from "./drizzle-hand-typed-weights-report-reader.js";
import { applyCancelledSale, applyCompletedSale } from "./test-support/applied-sales.js";
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

const reader = () => new DrizzleHandTypedWeightsReportReader(db);

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

const weighed = (weightSource: "SCALE" | "MANUAL" | null) =>
  aSoldLine(randomUUID(), "Queso", 500, 1_000, weightSource);

async function soldBy(
  actorId: string,
  deviceId: string,
  weightSources: ("SCALE" | "MANUAL" | null)[],
  options: { completedAt?: Date; inOpenSession?: string } = {},
) {
  return applyCompletedSale(db, {
    deviceId,
    completedAt: options.completedAt ?? MOMENT,
    total: 1_000,
    ...(options.inOpenSession === undefined ? {} : { inOpenSession: options.inOpenSession }),
    overrides: { actorId, lines: weightSources.map(weighed) },
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

function ordered<T extends { cashierId: string; weightSource: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    `${a.cashierId}/${a.weightSource}` < `${b.cashierId}/${b.weightSource}` ? -1 : 1,
  );
}

describe("DrizzleHandTypedWeightsReportReader.completedSaleLinesByWeightSource", () => {
  it("counts the lines of each cashier in each session by where their weight came from", async () => {
    const { deviceId, locationId } = await aRegister("Caja 7");
    const ana = await aUser("Ana", locationId);
    const beto = await aUser("Beto", locationId);
    const first = await soldBy(ana, deviceId, ["SCALE", "SCALE", "MANUAL", null]);
    const sessionId = await sessionOf(first);
    await soldBy(ana, deviceId, ["MANUAL"], { inOpenSession: sessionId });
    await soldBy(beto, deviceId, ["SCALE"], { inOpenSession: sessionId });

    const groups = await reader().completedSaleLinesByWeightSource({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    const common = { sessionId, registerName: "Caja 7", openedAt: MOMENT };
    expect(ordered(groups)).toEqual(
      ordered([
        { ...common, cashierId: ana, cashierName: "Ana", weightSource: "SCALE", lines: 2 },
        { ...common, cashierId: ana, cashierName: "Ana", weightSource: "MANUAL", lines: 2 },
        { ...common, cashierId: ana, cashierName: "Ana", weightSource: null, lines: 1 },
        { ...common, cashierId: beto, cashierName: "Beto", weightSource: "SCALE", lines: 1 },
      ]),
    );
  });

  it("keeps the sessions of one cashier apart", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    await soldBy(ana, deviceId, ["MANUAL"]);
    await soldBy(ana, deviceId, ["MANUAL"]);

    const groups = await reader().completedSaleLinesByWeightSource({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(new Set(groups.map((group) => group.sessionId)).size).toBe(2);
  });

  it("reports a cashier no user matches without a name", async () => {
    const { deviceId, locationId } = await aRegister();
    const stranger = randomUUID();
    await soldBy(stranger, deviceId, ["SCALE"]);

    const groups = await reader().completedSaleLinesByWeightSource({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(groups).toMatchObject([{ cashierId: stranger, cashierName: null, lines: 1 }]);
  });

  it("leaves out the lines of cancelled sales", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    await soldBy(ana, deviceId, ["SCALE"]);
    await applyCancelledSale(db, {
      deviceId,
      cancelledAt: MOMENT,
      total: 9_000,
      overrides: { actorId: ana, lines: [weighed("MANUAL")] },
    });

    const groups = await reader().completedSaleLinesByWeightSource({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(groups).toMatchObject([{ weightSource: "SCALE", lines: 1 }]);
  });

  it("dates a sale by the Argentina calendar day it was completed", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    const at = (completedAt: string) => ({ completedAt: new Date(completedAt) });
    await soldBy(ana, deviceId, ["MANUAL"], at("2026-10-05T02:59:00.000Z"));
    await soldBy(ana, deviceId, ["SCALE"], at("2026-10-05T03:00:00.000Z"));
    await soldBy(ana, deviceId, ["SCALE"], at("2026-10-07T02:59:00.000Z"));
    await soldBy(ana, deviceId, ["MANUAL"], at("2026-10-07T03:00:00.000Z"));

    const groups = await reader().completedSaleLinesByWeightSource({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(groups.map((group) => group.weightSource)).toEqual(["SCALE", "SCALE"]);
  });

  it("limits the report to the lines of the asked register", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const ana = await aUser("Ana", first.locationId);
    await soldBy(ana, first.deviceId, ["SCALE"]);
    await soldBy(ana, second.deviceId, ["MANUAL"]);

    const groups = await reader().completedSaleLinesByWeightSource({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(groups).toMatchObject([{ registerName: "Caja 2", weightSource: "MANUAL", lines: 1 }]);
  });

  it("never shows the lines of another branch, not even by asking for its register", async () => {
    const own = await aRegister();
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    const ana = await aUser("Ana", own.locationId);
    await soldBy(ana, own.deviceId, ["SCALE"]);
    await soldBy(ana, other.deviceId, ["MANUAL"]);

    const ofTheBranch = await reader().completedSaleLinesByWeightSource({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().completedSaleLinesByWeightSource({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch).toMatchObject([{ weightSource: "SCALE", lines: 1 }]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("reports nothing for a range without sales", async () => {
    const { locationId } = await aRegister();

    const groups = await reader().completedSaleLinesByWeightSource({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(groups).toEqual([]);
  });
});

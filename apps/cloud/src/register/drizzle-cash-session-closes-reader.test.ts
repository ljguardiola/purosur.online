import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registers, users } from "../platform/db/schema.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleCashSessionClosesReader } from "./drizzle-cash-session-closes-reader.js";
import {
  applyClosedCashSession,
  applyOpenedCashSession,
} from "./test-support/applied-cash-sessions.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const OPENED_AT = new Date("2026-10-06T11:00:00.000Z");
const CLOSED_AT = new Date("2026-10-06T20:00:00.000Z");
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

const reader = () => new DrizzleCashSessionClosesReader(db);

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

async function aClosedSession(
  deviceId: string,
  options: {
    openedBy: string;
    closedBy?: string;
    closedAt?: Date;
    expectedCash?: number;
    countedCash?: number;
  },
): Promise<string> {
  const sessionId = await applyOpenedCashSession(db, {
    deviceId,
    openedBy: options.openedBy,
    openedAt: OPENED_AT,
  });
  await applyClosedCashSession(db, {
    deviceId,
    sessionId,
    closedBy: options.closedBy ?? options.openedBy,
    closedAt: options.closedAt ?? CLOSED_AT,
    expectedCash: options.expectedCash ?? 10_000,
    countedCash: options.countedCash ?? 10_000,
  });
  return sessionId;
}

describe("DrizzleCashSessionClosesReader.closedCashSessions", () => {
  it("reports each closed session with its register, its people and its cash", async () => {
    const { deviceId, registerId, locationId } = await aRegister("Caja 2");
    const ana = await aUser("Ana", locationId);
    const beto = await aUser("Beto", locationId);
    const sessionId = await aClosedSession(deviceId, {
      openedBy: ana,
      closedBy: beto,
      expectedCash: 10_000,
      countedCash: 9_500,
    });

    const closes = await reader().closedCashSessions({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(closes).toEqual([
      {
        id: sessionId,
        closedAt: CLOSED_AT,
        registerId,
        registerName: "Caja 2",
        cashierId: ana,
        cashierName: "Ana",
        closedById: beto,
        closedByName: "Beto",
        expectedCash: 10_000,
        countedCash: 9_500,
        difference: -500,
      },
    ]);
  });

  it("reports a surplus as a positive difference", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    await aClosedSession(deviceId, { openedBy: ana, expectedCash: 10_000, countedCash: 10_300 });

    const closes = await reader().closedCashSessions({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(closes.map(({ difference }) => difference)).toEqual([300]);
  });

  it("leaves out a session that is still open", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    await applyOpenedCashSession(db, { deviceId, openedBy: ana, openedAt: OPENED_AT });

    const closes = await reader().closedCashSessions({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(closes).toEqual([]);
  });

  it("reports a session only once its close has been applied", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    const sessionId = await applyOpenedCashSession(db, {
      deviceId,
      openedBy: ana,
      openedAt: OPENED_AT,
    });
    const ask = () =>
      reader().closedCashSessions({ locationId, range: wholeOctober, registerId: undefined });

    const before = await ask();
    await applyClosedCashSession(db, {
      deviceId,
      sessionId,
      closedBy: ana,
      closedAt: CLOSED_AT,
      expectedCash: 5_000,
      countedCash: 5_000,
    });
    const after = await ask();

    expect(before).toEqual([]);
    expect(after.map(({ id }) => id)).toEqual([sessionId]);
  });

  it("reports the people no user matches without a name", async () => {
    const { deviceId, locationId } = await aRegister();
    const stranger = randomUUID();
    const outsider = randomUUID();
    await aClosedSession(deviceId, { openedBy: stranger, closedBy: outsider });

    const closes = await reader().closedCashSessions({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(closes).toMatchObject([
      { cashierId: stranger, cashierName: null, closedById: outsider, closedByName: null },
    ]);
  });

  it("dates a close by the Argentina calendar day it happened", async () => {
    const { deviceId, locationId } = await aRegister();
    const ana = await aUser("Ana", locationId);
    const at = (closedAt: string) => ({ openedBy: ana, closedAt: new Date(closedAt) });
    await aClosedSession(deviceId, { ...at("2026-10-05T02:59:00.000Z"), countedCash: 1 });
    const first = await aClosedSession(deviceId, { ...at("2026-10-05T03:00:00.000Z") });
    const last = await aClosedSession(deviceId, { ...at("2026-10-07T02:59:00.000Z") });
    await aClosedSession(deviceId, { ...at("2026-10-07T03:00:00.000Z"), countedCash: 1 });

    const closes = await reader().closedCashSessions({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(closes.map(({ id }) => id).sort()).toEqual([first, last].sort());
  });

  it("limits the report to the sessions of the asked register", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    const ana = await aUser("Ana", first.locationId);
    await aClosedSession(first.deviceId, { openedBy: ana });
    const ofSecond = await aClosedSession(second.deviceId, { openedBy: ana });

    const closes = await reader().closedCashSessions({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(closes.map(({ id }) => id)).toEqual([ofSecond]);
  });

  it("never shows the sessions of another branch, not even by asking for its register", async () => {
    const own = await aRegister();
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    const ana = await aUser("Ana", own.locationId);
    const ofOwn = await aClosedSession(own.deviceId, { openedBy: ana });
    await aClosedSession(other.deviceId, { openedBy: ana });

    const ofTheBranch = await reader().closedCashSessions({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().closedCashSessions({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch.map(({ id }) => id)).toEqual([ofOwn]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("reports nothing for a range without closes", async () => {
    const { locationId } = await aRegister();

    const closes = await reader().closedCashSessions({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(closes).toEqual([]);
  });
});

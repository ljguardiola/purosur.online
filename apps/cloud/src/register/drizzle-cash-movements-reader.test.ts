import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cashMovements, registers } from "../platform/db/schema.js";
import { insertLocation } from "../stock/test-support/stock-route-fixtures.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleCashMovementsReader } from "./drizzle-cash-movements-reader.js";
import { applyCashMovement, applyOpenedCashSession } from "./test-support/applied-cash-sessions.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-10-07T15:00:00.000Z");
const OPENED_AT = new Date("2026-10-06T11:00:00.000Z");
const MOVED_AT = new Date("2026-10-06T14:00:00.000Z");
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

const reader = () => new DrizzleCashMovementsReader(db);

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

async function anOpenSession(deviceId: string, openedAt = OPENED_AT): Promise<string> {
  return applyOpenedCashSession(db, { deviceId, openedBy: randomUUID(), openedAt });
}

async function aMovement(
  deviceId: string,
  sessionId: string,
  options: {
    type?: "CASH_IN" | "CASH_OUT" | "WITHDRAWAL";
    amount?: number;
    reason?: string;
    occurredAt?: Date;
  } = {},
): Promise<void> {
  await applyCashMovement(db, {
    deviceId,
    sessionId,
    type: options.type ?? "CASH_OUT",
    amount: options.amount ?? 800,
    reason: options.reason ?? "Compra de hielo",
    occurredAt: options.occurredAt ?? MOVED_AT,
  });
}

describe("DrizzleCashMovementsReader.reportedCashMovements", () => {
  it("reports each movement with its reason, its amount and the session it belongs to", async () => {
    const { deviceId, locationId } = await aRegister("Caja 2");
    const sessionId = await anOpenSession(deviceId);
    await aMovement(deviceId, sessionId, {
      type: "WITHDRAWAL",
      amount: 5_000,
      reason: "Retiro a caja fuerte",
    });

    const movements = await reader().reportedCashMovements({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(movements).toEqual([
      {
        id: expect.any(String),
        occurredAt: MOVED_AT,
        kind: "WITHDRAWAL",
        reason: "Retiro a caja fuerte",
        amount: 5_000,
        sessionId,
        registerName: "Caja 2",
        sessionOpenedAt: OPENED_AT,
      },
    ]);
  });

  it.each(["CASH_IN", "CASH_OUT", "WITHDRAWAL"] as const)(
    "reports a movement of kind %s",
    async (type) => {
      const { deviceId, locationId } = await aRegister();
      const sessionId = await anOpenSession(deviceId);
      await aMovement(deviceId, sessionId, { type });

      const movements = await reader().reportedCashMovements({
        locationId,
        range: wholeOctober,
        registerId: undefined,
      });

      expect(movements.map(({ kind }) => kind)).toEqual([type]);
    },
  );

  it("leaves out the movements of a kind the report does not cover", async () => {
    const { deviceId, locationId } = await aRegister();
    const sessionId = await anOpenSession(deviceId);
    await aMovement(deviceId, sessionId);
    await db.insert(cashMovements).values({
      id: randomUUID(),
      sessionId,
      type: "SALE",
      amount: 9_000,
      reason: null,
      actorId: randomUUID(),
      occurredAt: MOVED_AT,
    });

    const movements = await reader().reportedCashMovements({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(movements.map(({ kind }) => kind)).toEqual(["CASH_OUT"]);
  });

  it("refuses a reported movement that has no reason", async () => {
    const { deviceId, locationId } = await aRegister();
    const sessionId = await anOpenSession(deviceId);
    await db.insert(cashMovements).values({
      id: randomUUID(),
      sessionId,
      type: "CASH_IN",
      amount: 100,
      reason: null,
      actorId: randomUUID(),
      occurredAt: MOVED_AT,
    });

    await expect(
      reader().reportedCashMovements({ locationId, range: wholeOctober, registerId: undefined }),
    ).rejects.toThrow("has no reason");
  });

  it("reports a movement only once its event has been applied", async () => {
    const { deviceId, locationId } = await aRegister();
    const sessionId = await anOpenSession(deviceId);
    const ask = () =>
      reader().reportedCashMovements({ locationId, range: wholeOctober, registerId: undefined });

    const before = await ask();
    await aMovement(deviceId, sessionId);
    const after = await ask();

    expect(before).toEqual([]);
    expect(after).toHaveLength(1);
  });

  it("reports the movements of every session of the branch", async () => {
    const { deviceId, locationId } = await aRegister();
    const first = await anOpenSession(deviceId);
    const second = await anOpenSession(deviceId, new Date("2026-10-06T12:00:00.000Z"));
    await aMovement(deviceId, first);
    await aMovement(deviceId, second);

    const movements = await reader().reportedCashMovements({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(movements.map(({ sessionId }) => sessionId).sort()).toEqual([first, second].sort());
  });

  it("dates a movement by the Argentina calendar day it happened", async () => {
    const { deviceId, locationId } = await aRegister();
    const sessionId = await anOpenSession(deviceId);
    const at = (occurredAt: string) => ({ occurredAt: new Date(occurredAt) });
    await aMovement(deviceId, sessionId, { ...at("2026-10-05T02:59:00.000Z"), reason: "antes" });
    await aMovement(deviceId, sessionId, { ...at("2026-10-05T03:00:00.000Z"), reason: "primero" });
    await aMovement(deviceId, sessionId, { ...at("2026-10-07T02:59:00.000Z"), reason: "ultimo" });
    await aMovement(deviceId, sessionId, { ...at("2026-10-07T03:00:00.000Z"), reason: "despues" });

    const movements = await reader().reportedCashMovements({
      locationId,
      range: { from: "2026-10-05", to: "2026-10-06" },
      registerId: undefined,
    });

    expect(movements.map(({ reason }) => reason).sort()).toEqual(["primero", "ultimo"]);
  });

  it("limits the report to the movements of the asked register", async () => {
    const first = await aRegister();
    const second = await insertEnrolledInstallation(db, { now: NOW, registerName: "Caja 2" });
    await aMovement(first.deviceId, await anOpenSession(first.deviceId), { reason: "de la 1" });
    await aMovement(second.deviceId, await anOpenSession(second.deviceId), { reason: "de la 2" });

    const movements = await reader().reportedCashMovements({
      locationId: first.locationId,
      range: wholeOctober,
      registerId: second.registerId,
    });

    expect(movements.map(({ reason }) => reason)).toEqual(["de la 2"]);
  });

  it("never shows the movements of another branch, not even by asking for its register", async () => {
    const own = await aRegister();
    const otherLocation = await insertLocation(db);
    const other = await aRegister("Caja 9", otherLocation);
    await aMovement(own.deviceId, await anOpenSession(own.deviceId), { reason: "propio" });
    await aMovement(other.deviceId, await anOpenSession(other.deviceId), { reason: "ajeno" });

    const ofTheBranch = await reader().reportedCashMovements({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: undefined,
    });
    const ofAnotherBranchsRegister = await reader().reportedCashMovements({
      locationId: own.locationId,
      range: wholeOctober,
      registerId: other.registerId,
    });

    expect(ofTheBranch.map(({ reason }) => reason)).toEqual(["propio"]);
    expect(ofAnotherBranchsRegister).toEqual([]);
  });

  it("reports nothing for a range without movements", async () => {
    const { locationId } = await aRegister();

    const movements = await reader().reportedCashMovements({
      locationId,
      range: wholeOctober,
      registerId: undefined,
    });

    expect(movements).toEqual([]);
  });
});

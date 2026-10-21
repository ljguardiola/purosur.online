import { retireOfflinePointOfSale } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  locations,
  offlinePointOfSaleRetirements,
  registerOfflinePointsOfSale,
  registers,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleOfflinePointOfSaleRetirementStore } from "./drizzle-offline-point-of-sale-retirement-store.js";
import {
  configureOfflinePointOfSale,
  moveRegisterToOfflinePointOfSale,
} from "./test-support/offline-point-of-sale-fixtures.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");
const LATER = new Date("2026-01-06T09:30:00.000Z");

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

function retire(input: { locationId: string; pointOfSaleNumber: number; actorId: string }) {
  return retireOfflinePointOfSale(
    { store: new DrizzleOfflinePointOfSaleRetirementStore(db), clock: { now: () => LATER } },
    input,
  );
}

async function seedRegisterHoldingOfflineNumber(offlinePointOfSale: number) {
  const registerId = await configureOfflinePointOfSale(db, {
    registerName: "Caja 1",
    realTimePointOfSale: 7,
    offlinePointOfSale,
    now: NOON,
  });
  const locationId = await seededLocationId(db);
  const [actor] = await db.select({ id: users.id }).from(users);
  if (!actor) {
    throw new Error("test setup: the seeded actor is missing");
  }
  return { registerId, locationId, actorId: actor.id };
}

describe("retiring an offline point of sale through DrizzleOfflinePointOfSaleRetirementStore", () => {
  it("retires a number no register has assigned, recording who retired it and when, with an audit row", async () => {
    const seed = await seedRegisterHoldingOfflineNumber(8);
    await moveRegisterToOfflinePointOfSale(db, {
      registerId: seed.registerId,
      pointOfSaleNumber: 9,
      version: 1,
      now: NOON,
    });

    const outcome = await retire({ ...seed, pointOfSaleNumber: 8 });

    expect(outcome).toEqual({ kind: "retired", retiredAt: LATER });
    expect(await db.select().from(offlinePointOfSaleRetirements)).toEqual([
      { pointOfSaleNumber: 8, retiredAt: LATER, retiredBy: seed.actorId },
    ]);
    const audited = (await db.select().from(auditLog)).filter(
      ({ entity }) => entity === "offline_point_of_sale",
    );
    expect(audited).toMatchObject([
      {
        entityId: seed.registerId,
        actorId: seed.actorId,
        at: LATER,
        previousValue: null,
        newValue: { point_of_sale_number: 8, retired_at: LATER.toISOString() },
      },
    ]);
  });

  it("refuses a number a register has assigned, writing nothing", async () => {
    const seed = await seedRegisterHoldingOfflineNumber(8);

    const outcome = await retire({ ...seed, pointOfSaleNumber: 8 });

    expect(outcome).toEqual({ kind: "assigned" });
    expect(await db.select().from(offlinePointOfSaleRetirements)).toEqual([]);
    expect(await db.select().from(registerOfflinePointsOfSale)).toHaveLength(1);
  });

  it("finds no number held by a register of another branch, nor a real-time one", async () => {
    const seed = await seedRegisterHoldingOfflineNumber(8);
    await moveRegisterToOfflinePointOfSale(db, {
      registerId: seed.registerId,
      pointOfSaleNumber: 9,
      version: 1,
      now: NOON,
    });
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    await db.insert(registers).values({ locationId: otherLocation.id, name: "Caja 9" });

    const otherBranch = await retire({
      ...seed,
      locationId: otherLocation.id,
      pointOfSaleNumber: 8,
    });
    const realTime = await retire({ ...seed, pointOfSaleNumber: 7 });

    expect([otherBranch, realTime]).toEqual([{ kind: "not_found" }, { kind: "not_found" }]);
    expect(await db.select().from(offlinePointOfSaleRetirements)).toEqual([]);
  });

  it("refuses a number already retired, keeping the first retirement", async () => {
    const seed = await seedRegisterHoldingOfflineNumber(8);
    await moveRegisterToOfflinePointOfSale(db, {
      registerId: seed.registerId,
      pointOfSaleNumber: 9,
      version: 1,
      now: NOON,
    });
    await retire({ ...seed, pointOfSaleNumber: 8 });

    const second = await retire({ ...seed, pointOfSaleNumber: 8 });

    expect(second).toEqual({ kind: "already_retired" });
    expect(await db.select().from(offlinePointOfSaleRetirements)).toHaveLength(1);
    expect(
      (await db.select().from(auditLog)).filter(({ entity }) => entity === "offline_point_of_sale"),
    ).toHaveLength(1);
  });
});

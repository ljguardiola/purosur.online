import {
  configureRegisterOfflinePointOfSale,
  configureRegisterPointOfSale,
  PointOfSaleClaimConflict,
} from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  auditLog,
  changes,
  fiscalAddresses,
  locations,
  offlineNumberBlocks,
  pointOfSaleClaims,
  registerOfflinePointsOfSale,
  registers,
  users,
} from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "./drizzle-register-offline-point-of-sale-store.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

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

async function insertActor(locationId: string): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email: "ada@example.com", locationId })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

async function insertRegister(locationId: string, name: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

async function insertFiscalAddress(name = "Deposito Central"): Promise<string> {
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!fiscalAddress) {
    throw new Error("test setup: seeding the fiscal address returned no row");
  }
  return fiscalAddress.id;
}

async function insertOtherLocation(): Promise<string> {
  const [location] = await db.insert(locations).values({}).returning({ id: locations.id });
  if (!location) {
    throw new Error("test setup: seeding the other location returned no row");
  }
  return location.id;
}

async function configureRealTime(input: {
  locationId: string;
  registerId: string;
  pointOfSaleNumber: number;
  fiscalAddressId: string;
  version: number;
  actorId: string;
}) {
  return configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db, () => NOON), input);
}

function configure(input: {
  locationId: string;
  registerId: string;
  pointOfSaleNumber: number;
  version: number;
  actorId: string;
}) {
  return configureRegisterOfflinePointOfSale(
    new DrizzleRegisterOfflinePointOfSaleStore(db, () => NOON),
    input,
  );
}

async function seedRegisterWithRealTime(number = 7) {
  const locationId = await seededLocationId(db);
  const actorId = await insertActor(locationId);
  const registerId = await insertRegister(locationId, "Caja 1");
  const fiscalAddressId = await insertFiscalAddress();
  await configureRealTime({
    locationId,
    registerId,
    pointOfSaleNumber: number,
    fiscalAddressId,
    version: 0,
    actorId,
  });
  return { locationId, actorId, registerId, fiscalAddressId };
}

describe("configuring a register's offline point of sale through DrizzleRegisterOfflinePointOfSaleStore", () => {
  it("claims the number for the register as offline and stores it at version 1", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();

    const outcome = await configure({
      locationId,
      registerId,
      pointOfSaleNumber: 8,
      version: 0,
      actorId,
    });

    expect(outcome).toEqual({
      kind: "configured",
      setup: { pointOfSaleNumber: 8, version: 1 },
    });
    expect(await db.select().from(pointOfSaleClaims)).toMatchObject([
      { pointOfSaleNumber: 7, mechanism: "real_time" },
      { pointOfSaleNumber: 8, registerId, mechanism: "offline", claimedBy: actorId },
    ]);
    expect(await db.select().from(registerOfflinePointsOfSale)).toEqual([
      { registerId, pointOfSaleNumber: 8, mechanism: "offline", version: 1 },
    ]);
  });

  it("refuses a register with no real-time point of sale, writing nothing", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");

    const outcome = await configure({
      locationId,
      registerId,
      pointOfSaleNumber: 8,
      version: 0,
      actorId,
    });

    expect(outcome).toEqual({ kind: "real_time_point_of_sale_missing" });
    expect(await db.select().from(pointOfSaleClaims)).toEqual([]);
    expect(await db.select().from(registerOfflinePointsOfSale)).toEqual([]);
  });

  it("finds no register of another branch and writes nothing", async () => {
    const { actorId, locationId } = await seedRegisterWithRealTime();
    const otherRegisterId = await insertRegister(await insertOtherLocation(), "Caja 9");

    const outcome = await configure({
      locationId,
      registerId: otherRegisterId,
      pointOfSaleNumber: 8,
      version: 0,
      actorId,
    });

    expect(outcome).toEqual({ kind: "register_not_found" });
    expect(await db.select().from(registerOfflinePointsOfSale)).toEqual([]);
  });

  it("refuses a number held as a real-time point of sale, by the same register or another", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();
    const otherRegisterId = await insertRegister(locationId, "Caja 2");
    await configureRealTime({
      locationId,
      registerId: otherRegisterId,
      pointOfSaleNumber: 9,
      fiscalAddressId: await insertFiscalAddress("Sucursal Sur"),
      version: 0,
      actorId,
    });

    const own = await configure({
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      version: 0,
      actorId,
    });
    const other = await configure({
      locationId,
      registerId: otherRegisterId,
      pointOfSaleNumber: 7,
      version: 0,
      actorId,
    });

    expect([own, other]).toEqual([
      { kind: "point_of_sale_taken" },
      { kind: "point_of_sale_taken" },
    ]);
    expect(await db.select().from(registerOfflinePointsOfSale)).toEqual([]);
  });

  it("refuses a real-time point of sale on a number held as offline", async () => {
    const { locationId, actorId, registerId, fiscalAddressId } = await seedRegisterWithRealTime();
    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });

    const outcome = await configureRealTime({
      locationId,
      registerId,
      pointOfSaleNumber: 8,
      fiscalAddressId,
      version: 1,
      actorId,
    });

    expect(outcome).toEqual({ kind: "point_of_sale_taken" });
  });

  it("refuses a number another register holds as offline", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();
    const otherRegisterId = await insertRegister(locationId, "Caja 2");
    await configureRealTime({
      locationId,
      registerId: otherRegisterId,
      pointOfSaleNumber: 9,
      fiscalAddressId: await insertFiscalAddress("Sucursal Sur"),
      version: 0,
      actorId,
    });
    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });

    const outcome = await configure({
      locationId,
      registerId: otherRegisterId,
      pointOfSaleNumber: 8,
      version: 0,
      actorId,
    });

    expect(outcome).toEqual({ kind: "point_of_sale_taken" });
  });

  it("audits the actor with no previous value the first time and the replaced values after", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();

    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });
    await configure({ locationId, registerId, pointOfSaleNumber: 9, version: 1, actorId });

    const entries = (await db.select().from(auditLog)).filter(
      ({ entity }) => entity === "register_offline_point_of_sale",
    );
    expect(entries).toMatchObject([
      {
        entityId: registerId,
        actorId,
        previousValue: null,
        newValue: { point_of_sale_number: 8, version: 1 },
      },
      {
        entityId: registerId,
        actorId,
        previousValue: { point_of_sale_number: 8, version: 1 },
        newValue: { point_of_sale_number: 9, version: 2 },
      },
    ]);
  });

  it("notes the register's own change at the new version, scoped to no branch", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();
    const mark = await lastLoggedChangeSeq(db);

    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });
    await configure({ locationId, registerId, pointOfSaleNumber: 9, version: 1, actorId });

    const registerChanges = (await changesLoggedAfter(db, mark)).filter(
      ({ entity }) => entity === "register_offline_point_of_sale",
    );
    expect(registerChanges).toEqual([
      {
        entity: "register_offline_point_of_sale",
        entityId: registerId,
        version: 1,
        op: "insert",
        locationId: null,
      },
      {
        entity: "register_offline_point_of_sale",
        entityId: registerId,
        version: 2,
        op: "update",
        locationId: null,
      },
    ]);
  });

  it("logs nothing when the configuration is unchanged or refused", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();
    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });
    const mark = await lastLoggedChangeSeq(db);

    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 1, actorId });
    await configure({ locationId, registerId, pointOfSaleNumber: 9, version: 0, actorId });

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
  });

  it("raises a claim conflict when a number is claimed twice", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();
    const otherRegisterId = await insertRegister(locationId, "Caja 2");
    const store = new DrizzleRegisterOfflinePointOfSaleStore(db, () => NOON);
    await store.transaction((tx) =>
      tx.claimPointOfSale({ pointOfSaleNumber: 8, registerId, mechanism: "offline", actorId }),
    );

    const claim = store.transaction((tx) =>
      tx.claimPointOfSale({
        pointOfSaleNumber: 8,
        registerId: otherRegisterId,
        mechanism: "offline",
        actorId,
      }),
    );

    await expect(claim).rejects.toBeInstanceOf(PointOfSaleClaimConflict);
  });
});

describe("the offline number blocks DrizzleRegisterOfflinePointOfSaleStore records", () => {
  it("records the first block of a configured point of sale in use, from the first number, at the moment of the assignment", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();

    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });

    expect(await db.select().from(offlineNumberBlocks)).toEqual([
      {
        id: expect.any(String),
        pointOfSaleNumber: 8,
        documentType: "factura_c",
        registerId,
        mechanism: "offline",
        firstNumber: 1,
        lastNumber: 1000,
        status: "in_use",
        assignedAt: NOON,
        version: 1,
      },
    ]);
  });

  it("notes the block's change for its register, scoped to no branch", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();
    const mark = await lastLoggedChangeSeq(db);

    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });

    const [block] = await db.select().from(offlineNumberBlocks);
    const logged = await db
      .select({
        entity: changes.entity,
        entityId: changes.entityId,
        version: changes.version,
        op: changes.op,
        locationId: changes.locationId,
        registerId: changes.registerId,
      })
      .from(changes)
      .where(eq(changes.entity, "offline_number_block"));
    expect(logged).toEqual([
      {
        entity: "offline_number_block",
        entityId: block?.id,
        version: 1,
        op: "insert",
        locationId: null,
        registerId,
      },
    ]);
    expect(await changesLoggedAfter(db, mark)).toHaveLength(2);
  });

  it("notes no register on the other changes", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();

    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });

    const [setup] = await db
      .select({ registerId: changes.registerId })
      .from(changes)
      .where(eq(changes.entity, "register_offline_point_of_sale"));
    expect(setup).toEqual({ registerId: null });
  });

  it("keeps the blocks of one point of sale apart from another's", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();
    const otherRegisterId = await insertRegister(locationId, "Caja 2");
    await configureRealTime({
      locationId,
      registerId: otherRegisterId,
      pointOfSaleNumber: 9,
      fiscalAddressId: await insertFiscalAddress("Sucursal Sur"),
      version: 0,
      actorId,
    });

    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });
    await configure({
      locationId,
      registerId: otherRegisterId,
      pointOfSaleNumber: 10,
      version: 0,
      actorId,
    });

    const blocks = await db.select().from(offlineNumberBlocks);
    expect(
      blocks
        .map(({ pointOfSaleNumber, firstNumber, lastNumber }) => [
          pointOfSaleNumber,
          firstNumber,
          lastNumber,
        ])
        .sort(),
    ).toEqual([
      [10, 1, 1000],
      [8, 1, 1000],
    ]);
  });

  it("assigns no second first block when the point of sale already has one", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();
    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });
    await configure({ locationId, registerId, pointOfSaleNumber: 9, version: 1, actorId });
    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 2, actorId });

    const blocks = await db.select().from(offlineNumberBlocks);
    expect(
      blocks.map(({ pointOfSaleNumber, firstNumber }) => [pointOfSaleNumber, firstNumber]).sort(),
    ).toEqual([
      [8, 1],
      [9, 1],
    ]);
  });

  it("deletes no block when the register moves to another point of sale", async () => {
    const { locationId, actorId, registerId } = await seedRegisterWithRealTime();
    await configure({ locationId, registerId, pointOfSaleNumber: 8, version: 0, actorId });

    await configure({ locationId, registerId, pointOfSaleNumber: 9, version: 1, actorId });

    expect(await db.select().from(offlineNumberBlocks)).toHaveLength(2);
  });
});

describe("DrizzleRegisterOfflinePointOfSaleStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzleRegisterOfflinePointOfSaleStore>
    >();
  });
});

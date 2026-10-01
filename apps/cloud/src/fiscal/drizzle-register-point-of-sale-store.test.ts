import {
  configureRegisterPointOfSale,
  PointOfSaleClaimConflict,
} from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  fiscalAddresses,
  locations,
  pointOfSaleClaims,
  registerPointsOfSale,
  registers,
  users,
} from "../platform/db/schema.js";
import { changesLoggedAfter, lastLoggedChangeSeq } from "../sync/test-support/logged-changes.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterPointOfSaleStore } from "./drizzle-register-point-of-sale-store.js";

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
    .values({ firstName: "Ada Lovelace", email: "ada@example.com", locationId })
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

function configure(input: {
  locationId: string;
  registerId: string;
  pointOfSaleNumber: number;
  fiscalAddressId: string;
  version: number;
  actorId: string;
}) {
  return configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db), input);
}

describe("configuring a register's point of sale through DrizzleRegisterPointOfSaleStore", () => {
  it("claims the number for the register and stores its point of sale at version 1", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress();

    const outcome = await configure({
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId,
    });

    expect(outcome).toEqual({
      kind: "configured",
      setup: { pointOfSaleNumber: 7, fiscalAddressId, version: 1 },
    });
    expect(await db.select().from(pointOfSaleClaims)).toMatchObject([
      { pointOfSaleNumber: 7, registerId, claimedBy: actorId },
    ]);
    expect(await db.select().from(registerPointsOfSale)).toEqual([
      { registerId, pointOfSaleNumber: 7, fiscalAddressId, version: 1 },
    ]);
  });

  it("audits the actor with no previous value the first time and the replaced values after", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const otherFiscalAddressId = await insertFiscalAddress("Sucursal Sur");

    await configure({
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId,
    });
    await configure({
      locationId,
      registerId,
      pointOfSaleNumber: 8,
      fiscalAddressId: otherFiscalAddressId,
      version: 1,
      actorId,
    });

    const entries = await db.select().from(auditLog);
    expect(entries).toMatchObject([
      {
        entity: "register_point_of_sale",
        entityId: registerId,
        actorId,
        previousValue: null,
        newValue: { point_of_sale_number: 7, fiscal_address_id: fiscalAddressId, version: 1 },
      },
      {
        entity: "register_point_of_sale",
        entityId: registerId,
        actorId,
        previousValue: { point_of_sale_number: 7, fiscal_address_id: fiscalAddressId, version: 1 },
        newValue: {
          point_of_sale_number: 8,
          fiscal_address_id: otherFiscalAddressId,
          version: 2,
        },
      },
    ]);
  });

  it("keeps the number a register gave up claimed by it, and gives it to no other register", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const otherRegisterId = await insertRegister(locationId, "Caja 2");
    const fiscalAddressId = await insertFiscalAddress();
    const base = { locationId, fiscalAddressId, actorId };
    await configure({ ...base, registerId, pointOfSaleNumber: 7, version: 0 });
    await configure({ ...base, registerId, pointOfSaleNumber: 8, version: 1 });

    const outcome = await configure({
      ...base,
      registerId: otherRegisterId,
      pointOfSaleNumber: 7,
      version: 0,
    });

    expect(outcome).toEqual({ kind: "point_of_sale_taken" });
    expect(await db.select().from(pointOfSaleClaims)).toMatchObject([
      { pointOfSaleNumber: 7, registerId },
      { pointOfSaleNumber: 8, registerId },
    ]);
    expect(await db.select().from(registerPointsOfSale)).toMatchObject([
      { registerId, pointOfSaleNumber: 8, version: 2 },
    ]);
  });

  it("lets the register take its old number back", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const base = { locationId, registerId, fiscalAddressId, actorId };
    await configure({ ...base, pointOfSaleNumber: 7, version: 0 });
    await configure({ ...base, pointOfSaleNumber: 8, version: 1 });

    const outcome = await configure({ ...base, pointOfSaleNumber: 7, version: 2 });

    expect(outcome).toMatchObject({ kind: "configured", setup: { pointOfSaleNumber: 7 } });
    expect(await db.select().from(pointOfSaleClaims)).toHaveLength(2);
  });

  it("finds no register of another branch and writes nothing", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const otherRegisterId = await insertRegister(await insertOtherLocation(), "Caja 1");
    const fiscalAddressId = await insertFiscalAddress();

    const outcome = await configure({
      locationId,
      registerId: otherRegisterId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId,
    });

    expect(outcome).toEqual({ kind: "register_not_found" });
    expect(await db.select().from(pointOfSaleClaims)).toEqual([]);
    expect(await db.select().from(registerPointsOfSale)).toEqual([]);
  });

  it("finds no fiscal address for an id nobody has, claiming nothing", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");

    const outcome = await configure({
      locationId,
      registerId,
      pointOfSaleNumber: 7,
      fiscalAddressId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      version: 0,
      actorId,
    });

    expect(outcome).toEqual({ kind: "fiscal_address_not_found" });
    expect(await db.select().from(pointOfSaleClaims)).toEqual([]);
  });

  it("refuses a version other than the one stored, changing nothing", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const base = { locationId, registerId, fiscalAddressId, actorId };
    await configure({ ...base, pointOfSaleNumber: 7, version: 0 });

    const outcome = await configure({ ...base, pointOfSaleNumber: 8, version: 0 });

    expect(outcome).toEqual({ kind: "stale_version" });
    expect(await db.select().from(registerPointsOfSale)).toMatchObject([
      { pointOfSaleNumber: 7, version: 1 },
    ]);
  });

  it("notes the register's own change at the new version, scoped to no branch", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const base = { locationId, registerId, fiscalAddressId, actorId };
    const mark = await lastLoggedChangeSeq(db);

    await configure({ ...base, pointOfSaleNumber: 7, version: 0 });
    await configure({ ...base, pointOfSaleNumber: 8, version: 1 });

    expect(await changesLoggedAfter(db, mark)).toEqual([
      {
        entity: "register_point_of_sale",
        entityId: registerId,
        version: 1,
        op: "insert",
        locationId: null,
      },
      {
        entity: "register_point_of_sale",
        entityId: registerId,
        version: 2,
        op: "update",
        locationId: null,
      },
    ]);
  });

  it("logs nothing when the configuration is unchanged or refused", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const fiscalAddressId = await insertFiscalAddress();
    const base = { locationId, registerId, fiscalAddressId, actorId };
    await configure({ ...base, pointOfSaleNumber: 7, version: 0 });
    const mark = await lastLoggedChangeSeq(db);

    await configure({ ...base, pointOfSaleNumber: 7, version: 1 });
    await configure({ ...base, pointOfSaleNumber: 9, version: 0 });

    expect(await changesLoggedAfter(db, mark)).toEqual([]);
  });

  it("raises a claim conflict when a number is claimed twice", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const registerId = await insertRegister(locationId, "Caja 1");
    const otherRegisterId = await insertRegister(locationId, "Caja 2");
    await db
      .insert(pointOfSaleClaims)
      .values({ pointOfSaleNumber: 7, registerId, claimedBy: actorId });
    const store = new DrizzleRegisterPointOfSaleStore(db);

    const claim = store.transaction((tx) =>
      tx.claimPointOfSale({ pointOfSaleNumber: 7, registerId: otherRegisterId, actorId }),
    );

    await expect(claim).rejects.toBeInstanceOf(PointOfSaleClaimConflict);
  });
});

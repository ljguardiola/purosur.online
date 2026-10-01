import { configureRegisterPointOfSale } from "@purosur/domain/fiscal/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fiscalAddresses, locations, registers, users } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterPointOfSaleReader } from "./drizzle-register-point-of-sale-reader.js";
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
    .values({ firstName: "Marta Quiroga", email: "marta@example.com", locationId })
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

async function insertFiscalAddress(): Promise<string> {
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name: "Deposito Central", streetAddress: "Calle Ficticia 123, CABA" })
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

describe("DrizzleRegisterPointOfSaleReader", () => {
  it("lists the branch's registers by name, with no point of sale for one never configured", async () => {
    const locationId = await seededLocationId(db);
    const configuredId = await insertRegister(locationId, "Caja 2");
    const neverConfiguredId = await insertRegister(locationId, "Caja 1");
    await insertRegister(await insertOtherLocation(), "Caja 3");
    const fiscalAddressId = await insertFiscalAddress();
    await configureRegisterPointOfSale(new DrizzleRegisterPointOfSaleStore(db), {
      locationId,
      registerId: configuredId,
      pointOfSaleNumber: 7,
      fiscalAddressId,
      version: 0,
      actorId: await insertActor(locationId),
    });

    const listed = await new DrizzleRegisterPointOfSaleReader(db).listBranchRegisterPointsOfSale(
      locationId,
    );

    expect(listed).toEqual([
      {
        registerId: neverConfiguredId,
        registerName: "Caja 1",
        pointOfSaleNumber: null,
        fiscalAddressId: null,
        version: 0,
      },
      {
        registerId: configuredId,
        registerName: "Caja 2",
        pointOfSaleNumber: 7,
        fiscalAddressId,
        version: 1,
      },
    ]);
  });
});

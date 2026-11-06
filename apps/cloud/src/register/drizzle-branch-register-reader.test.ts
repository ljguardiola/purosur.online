import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  fiscalAddresses,
  locations,
  pointOfSaleClaims,
  registerInstallationBitlockerKeys,
  registerPointsOfSale,
  registerPointTerminals,
  registerQrPointsOfSale,
  registers,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBranchRegisterReader } from "./drizzle-branch-register-reader.js";
import { insertEnrolledInstallation } from "./test-support/enrolled-installation.js";

const NOW = new Date("2026-09-29T12:00:00.000Z");

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

describe("branchRegisters of DrizzleBranchRegisterReader", () => {
  it("lists the branch's registers by name with the number each was configured with, null for one never configured", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const configuredId = await insertRegister(locationId, "Caja 2");
    const neverConfiguredId = await insertRegister(locationId, "Caja 1");
    await insertRegister(await insertOtherLocation(), "Caja 3");
    await db.insert(pointOfSaleClaims).values({
      pointOfSaleNumber: 7,
      registerId: configuredId,
      mechanism: "real_time",
      claimedBy: actorId,
    });
    await db.insert(registerPointsOfSale).values({
      registerId: configuredId,
      pointOfSaleNumber: 7,
      fiscalAddressId: await insertFiscalAddress(),
      version: 1,
    });
    await db
      .insert(registerPointTerminals)
      .values({ registerId: configuredId, terminalId: "PAX_A910__SMARTPOS1", version: 2 });
    await db
      .insert(registerQrPointsOfSale)
      .values({ registerId: configuredId, externalPosId: "CAJA2_STORE_POS", version: 3 });

    const listed = await new DrizzleBranchRegisterReader(db).branchRegisters(locationId);

    expect(listed).toEqual([
      {
        id: neverConfiguredId,
        name: "Caja 1",
        enrollmentCode: null,
        pointOfSaleNumber: null,
        pointTerminal: { terminalId: null, version: 0 },
        qrPointOfSale: { externalPosId: null, version: 0 },
        installations: [],
      },
      {
        id: configuredId,
        name: "Caja 2",
        enrollmentCode: null,
        pointOfSaleNumber: 7,
        pointTerminal: { terminalId: "PAX_A910__SMARTPOS1", version: 2 },
        qrPointOfSale: { externalPosId: "CAJA2_STORE_POS", version: 3 },
        installations: [],
      },
    ]);
  });

  it("lists the registers with numbers by value, case and accents ignored and ñ after n", async () => {
    const locationId = await seededLocationId(db);
    for (const name of [
      "Zoe",
      "Caja 10",
      "ñandú",
      "Banco",
      "oso",
      "árbol",
      "Caja 2",
      "ana",
      "nube",
    ]) {
      await insertRegister(locationId, name);
    }

    const listed = await new DrizzleBranchRegisterReader(db).branchRegisters(locationId);

    expect(listed.map((register) => register.name)).toEqual([
      "ana",
      "árbol",
      "Banco",
      "Caja 2",
      "Caja 10",
      "nube",
      "ñandú",
      "oso",
      "Zoe",
    ]);
  });

  it("lists every installation of each of the branch's registers, without repeating a register", async () => {
    const locationId = await seededLocationId(db);
    const caja1 = await insertRegister(locationId, "Caja 1");
    const caja2 = await insertRegister(locationId, "Caja 2");
    const otherBranchRegister = await insertRegister(await insertOtherLocation(), "Caja 3");
    const replacedAt = new Date("2026-09-20T12:00:00.000Z");
    const revokedAt = new Date("2026-09-25T12:00:00.000Z");
    await insertEnrolledInstallation(db, {
      now: new Date("2026-09-10T12:00:00.000Z"),
      existingRegisterId: caja1,
      revokedAt: replacedAt,
    });
    await insertEnrolledInstallation(db, {
      now: new Date("2026-09-21T12:00:00.000Z"),
      existingRegisterId: caja1,
    });
    await insertEnrolledInstallation(db, {
      now: new Date("2026-09-22T12:00:00.000Z"),
      existingRegisterId: caja2,
      revokedAt,
    });
    await insertEnrolledInstallation(db, {
      now: new Date("2026-09-23T12:00:00.000Z"),
      existingRegisterId: otherBranchRegister,
    });

    const listed = await new DrizzleBranchRegisterReader(db).branchRegisters(locationId);

    expect(listed.map(({ id }) => id)).toEqual([caja1, caja2]);
    expect(listed[0]?.installations).toHaveLength(2);
    expect(listed[0]?.installations).toEqual(
      expect.arrayContaining([
        {
          hostname: "CAJA-MOSTRADOR",
          windowsVersion: "Windows 11 Pro 10.0.26100",
          enrolledAt: new Date("2026-09-09T12:00:00.000Z"),
          revokedAt: replacedAt,
          bitlockerKeyLoaded: false,
        },
        {
          hostname: "CAJA-MOSTRADOR",
          windowsVersion: "Windows 11 Pro 10.0.26100",
          enrolledAt: new Date("2026-09-20T12:00:00.000Z"),
          revokedAt: null,
          bitlockerKeyLoaded: false,
        },
      ]),
    );
    expect(listed[1]?.installations).toEqual([
      {
        hostname: "CAJA-MOSTRADOR",
        windowsVersion: "Windows 11 Pro 10.0.26100",
        enrolledAt: new Date("2026-09-21T12:00:00.000Z"),
        revokedAt,
        bitlockerKeyLoaded: false,
      },
    ]);
  });

  it("flags only the installations that have a BitLocker key loaded", async () => {
    const locationId = await seededLocationId(db);
    const caja1 = await insertRegister(locationId, "Caja 1");
    await insertEnrolledInstallation(db, {
      now: new Date("2026-09-10T12:00:00.000Z"),
      existingRegisterId: caja1,
      revokedAt: new Date("2026-09-20T12:00:00.000Z"),
    });
    const withKey = await insertEnrolledInstallation(db, {
      now: new Date("2026-09-21T12:00:00.000Z"),
      existingRegisterId: caja1,
    });
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada", email: "ada@example.com", locationId })
      .returning({ id: users.id });
    await db.insert(registerInstallationBitlockerKeys).values({
      installationId: withKey.deviceId,
      sealedKey: "sealed",
      keyIdentifier: "8F3A2C1D",
      loadedAt: NOW,
      loadedBy: actor?.id ?? "",
    });

    const [listed] = await new DrizzleBranchRegisterReader(db).branchRegisters(
      locationId,
    );

    expect(
      listed?.installations.map(({ revokedAt, bitlockerKeyLoaded }) => [
        revokedAt === null,
        bitlockerKeyLoaded,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [false, false],
        [true, true],
      ]),
    );
  });
});

describe("hasRegister of DrizzleBranchRegisterReader", () => {
  it("finds a register of the branch", async () => {
    const locationId = await seededLocationId(db);
    const registerId = await insertRegister(locationId, "Caja 1");

    expect(await new DrizzleBranchRegisterReader(db).hasRegister(locationId, registerId)).toBe(
      true,
    );
  });

  it("finds no register that belongs to another branch", async () => {
    const locationId = await seededLocationId(db);
    const otherBranchRegister = await insertRegister(await insertOtherLocation(), "Caja 1");

    expect(
      await new DrizzleBranchRegisterReader(db).hasRegister(locationId, otherBranchRegister),
    ).toBe(false);
  });
});

describe("DrizzleBranchRegisterReader's construction", () => {
  it("is built from the database alone, refusing a clock", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().toExtend<
      ConstructorParameters<typeof DrizzleBranchRegisterReader>
    >();
    expectTypeOf<[PgDatabase<PgQueryResultHKT>, () => Date]>().not.toExtend<
      ConstructorParameters<typeof DrizzleBranchRegisterReader>
    >();
  });
});

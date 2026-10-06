import { emitEnrollmentCode } from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  auditLog,
  fiscalAddresses,
  locations,
  pointOfSaleClaims,
  registerEnrollmentCodes,
  registerPointsOfSale,
  registers,
  users,
} from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleBranchRegisterStore } from "./drizzle-branch-register-store.js";
import { secretEnrollmentCodes } from "./register-enrollment-code.js";

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

describe("emitting an enrollment code through DrizzleBranchRegisterStore", () => {
  it("finds no register in another branch, writing no code and no audit entry", async () => {
    const locationId = await seededLocationId(db);
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada Lovelace", email: "ada@example.com", locationId })
      .returning({ id: users.id });
    if (!otherLocation || !actor) {
      throw new Error("test setup: seeding the other location or the actor returned no row");
    }
    const [otherBranchRegister] = await db
      .insert(registers)
      .values({ locationId: otherLocation.id, name: "Caja 1" })
      .returning({ id: registers.id });
    if (!otherBranchRegister) {
      throw new Error("test setup: seeding the register returned no row");
    }

    const outcome = await emitEnrollmentCode(
      {
        store: new DrizzleBranchRegisterStore(db, () => NOW),
        clock: { now: () => NOW },
        codes: secretEnrollmentCodes,
      },
      { locationId, registerId: otherBranchRegister.id, actorId: actor.id },
    );

    expect(outcome).toEqual({ kind: "register_not_found" });
    expect(await db.select().from(registerEnrollmentCodes)).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });
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

describe("branchRegisters of DrizzleBranchRegisterStore", () => {
  it("lists the branch's registers by name with the number each was configured with, null for one never configured", async () => {
    const locationId = await seededLocationId(db);
    const actorId = await insertActor(locationId);
    const configuredId = await insertRegister(locationId, "Caja 2");
    const neverConfiguredId = await insertRegister(locationId, "Caja 1");
    await insertRegister(await insertOtherLocation(), "Caja 3");
    await db
      .insert(pointOfSaleClaims)
      .values({ pointOfSaleNumber: 7, registerId: configuredId, claimedBy: actorId });
    await db.insert(registerPointsOfSale).values({
      registerId: configuredId,
      pointOfSaleNumber: 7,
      fiscalAddressId: await insertFiscalAddress(),
      version: 1,
    });

    const listed = await new DrizzleBranchRegisterStore(db, () => NOW).branchRegisters(locationId);

    expect(listed).toEqual([
      { id: neverConfiguredId, name: "Caja 1", enrollmentCode: null, pointOfSaleNumber: null },
      { id: configuredId, name: "Caja 2", enrollmentCode: null, pointOfSaleNumber: 7 },
    ]);
  });
});

describe("DrizzleBranchRegisterStore's clock", () => {
  it("is required to build the store", () => {
    expectTypeOf<[PgDatabase<PgQueryResultHKT>]>().not.toExtend<
      ConstructorParameters<typeof DrizzleBranchRegisterStore>
    >();
  });
});

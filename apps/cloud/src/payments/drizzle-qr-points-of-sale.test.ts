import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerQrPointsOfSale, registers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleQrPointsOfSale } from "./drizzle-qr-points-of-sale.js";

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

async function insertRegister(name: string): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId: await seededLocationId(db), name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

describe("DrizzleQrPointsOfSale", () => {
  it("answers the QR point of sale assigned to the register", async () => {
    const registerId = await insertRegister("Caja 1");
    await db
      .insert(registerQrPointsOfSale)
      .values({ registerId, externalPosId: "CAJA1_STORE_POS", version: 1 });

    expect(await new DrizzleQrPointsOfSale(db).pointOfSaleOfRegister(registerId)).toBe(
      "CAJA1_STORE_POS",
    );
  });

  it("answers the QR point of sale of each register, never another's", async () => {
    const first = await insertRegister("Caja 1");
    const second = await insertRegister("Caja 2");
    await db.insert(registerQrPointsOfSale).values([
      { registerId: first, externalPosId: "CAJA1_STORE_POS", version: 1 },
      { registerId: second, externalPosId: "CAJA2_STORE_POS", version: 1 },
    ]);
    const qrPointsOfSale = new DrizzleQrPointsOfSale(db);

    expect(await qrPointsOfSale.pointOfSaleOfRegister(second)).toBe("CAJA2_STORE_POS");
    expect(await qrPointsOfSale.pointOfSaleOfRegister(first)).toBe("CAJA1_STORE_POS");
  });

  it("answers null for a register that was never assigned a QR point of sale", async () => {
    const registerId = await insertRegister("Caja 1");

    expect(await new DrizzleQrPointsOfSale(db).pointOfSaleOfRegister(registerId)).toBeNull();
  });

  it("answers null for a register whose QR point of sale was removed", async () => {
    const registerId = await insertRegister("Caja 1");
    await db.insert(registerQrPointsOfSale).values({ registerId, externalPosId: null, version: 2 });

    expect(await new DrizzleQrPointsOfSale(db).pointOfSaleOfRegister(registerId)).toBeNull();
  });
});

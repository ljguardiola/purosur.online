import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerPointTerminals, registers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzlePointTerminals } from "./drizzle-point-terminals.js";

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

describe("DrizzlePointTerminals", () => {
  it("answers the terminal assigned to the register", async () => {
    const registerId = await insertRegister("Caja 1");
    await db
      .insert(registerPointTerminals)
      .values({ registerId, terminalId: "PAX_A910__SMARTPOS1", version: 1 });

    expect(await new DrizzlePointTerminals(db).terminalOfRegister(registerId)).toBe(
      "PAX_A910__SMARTPOS1",
    );
  });

  it("answers the terminal of each register, never another's", async () => {
    const first = await insertRegister("Caja 1");
    const second = await insertRegister("Caja 2");
    await db.insert(registerPointTerminals).values([
      { registerId: first, terminalId: "PAX_A910__SMARTPOS1", version: 1 },
      { registerId: second, terminalId: "PAX_A910__SMARTPOS2", version: 1 },
    ]);
    const pointTerminals = new DrizzlePointTerminals(db);

    expect(await pointTerminals.terminalOfRegister(second)).toBe("PAX_A910__SMARTPOS2");
    expect(await pointTerminals.terminalOfRegister(first)).toBe("PAX_A910__SMARTPOS1");
  });

  it("answers null for a register that was never assigned a terminal", async () => {
    const registerId = await insertRegister("Caja 1");

    expect(await new DrizzlePointTerminals(db).terminalOfRegister(registerId)).toBeNull();
  });

  it("answers null for a register whose terminal was removed", async () => {
    const registerId = await insertRegister("Caja 1");
    await db.insert(registerPointTerminals).values({ registerId, terminalId: null, version: 2 });

    expect(await new DrizzlePointTerminals(db).terminalOfRegister(registerId)).toBeNull();
  });
});

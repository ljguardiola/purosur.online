import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { locations, registerPointTerminals, registers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleRegisterPointTerminalReader } from "./drizzle-register-point-terminal-reader.js";

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

describe("ofBranch of DrizzleRegisterPointTerminalReader", () => {
  it("answers each assigned register's terminal and version, and version 0 with no terminal for any other", async () => {
    const locationId = await seededLocationId(db);
    const assignedId = await insertRegister(locationId, "Caja 1");
    const clearedId = await insertRegister(locationId, "Caja 2");
    const neverAssignedId = await insertRegister(locationId, "Caja 3");
    await db.insert(registerPointTerminals).values([
      { registerId: assignedId, terminalId: "PAX_A910__SMARTPOS1", version: 2 },
      { registerId: clearedId, terminalId: null, version: 3 },
    ]);

    const terminalOf = await new DrizzleRegisterPointTerminalReader(db).ofBranch(locationId);

    expect([assignedId, clearedId, neverAssignedId].map(terminalOf)).toEqual([
      { terminalId: "PAX_A910__SMARTPOS1", version: 2 },
      { terminalId: null, version: 3 },
      { terminalId: null, version: 0 },
    ]);
  });

  it("knows nothing of another branch's registers", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    if (!otherLocation) {
      throw new Error("test setup: seeding the other location returned no row");
    }
    const otherRegisterId = await insertRegister(otherLocation.id, "Caja 1");
    await db
      .insert(registerPointTerminals)
      .values({ registerId: otherRegisterId, terminalId: "PAX_A910__SMARTPOS1", version: 1 });

    const terminalOf = await new DrizzleRegisterPointTerminalReader(db).ofBranch(
      await seededLocationId(db),
    );

    expect(terminalOf(otherRegisterId)).toEqual({ terminalId: null, version: 0 });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deviceState, locations, registers } from "../platform/db/schema.js";
import { insertEnrolledInstallation } from "../register/test-support/enrolled-installation.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleInstallationsLeftBehindReader } from "./drizzle-installations-left-behind-reader.js";

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

describe("DrizzleInstallationsLeftBehindReader", () => {
  it("answers the installations left behind by register name with numbers by value, case and accents ignored and ñ after n", async () => {
    for (const registerName of [
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
      await insertEnrolledInstallation(db, { now: NOW, registerName });
    }

    const leftBehind = await new DrizzleInstallationsLeftBehindReader(db).installationsLeftBehindBy(
      "2.0.0",
    );

    expect(leftBehind.map(({ registerName }) => registerName)).toEqual([
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

  it("answers installations of registers with the same name in the order of their ids", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    const [otherRegister] = await db
      .insert(registers)
      .values({ locationId: otherLocation?.id ?? "", name: "Caja 1" })
      .returning({ id: registers.id });
    await insertEnrolledInstallation(db, {
      now: NOW,
      deviceId: "00000000-0000-4000-8000-00000000000b",
      existingRegisterId: otherRegister?.id ?? "",
    });
    await insertEnrolledInstallation(db, {
      now: NOW,
      deviceId: "00000000-0000-4000-8000-00000000000a",
      registerName: "Caja 1",
    });
    await db.insert(deviceState).values([
      { deviceId: "00000000-0000-4000-8000-00000000000b", appVersion: "1.0.0" },
      { deviceId: "00000000-0000-4000-8000-00000000000a", appVersion: "1.1.0" },
    ]);

    const leftBehind = await new DrizzleInstallationsLeftBehindReader(db).installationsLeftBehindBy(
      "2.0.0",
    );

    expect(leftBehind).toEqual([
      { registerName: "Caja 1", appVersion: "1.1.0" },
      { registerName: "Caja 1", appVersion: "1.0.0" },
    ]);
  });
});

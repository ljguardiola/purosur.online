import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { locations, registers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleSnapshotBackupsReader } from "./drizzle-snapshot-backups-reader.js";

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

describe("DrizzleSnapshotBackupsReader", () => {
  it("answers the registers with numbers by value, case and accents ignored and ñ after n", async () => {
    const locationId = await seededLocationId(db);
    await db
      .insert(registers)
      .values(
        ["Zoe", "Caja 10", "ñandú", "Banco", "oso", "árbol", "Caja 2", "ana", "nube"].map(
          (name) => ({ locationId, name }),
        ),
      );

    const listed = await new DrizzleSnapshotBackupsReader(db).registersForBackups();

    expect(listed.map(({ name }) => name)).toEqual([
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

  it("answers registers of the same name in different branches in the order of their ids", async () => {
    const [otherLocation] = await db.insert(locations).values({}).returning({ id: locations.id });
    await db.insert(registers).values([
      {
        id: "00000000-0000-4000-8000-00000000000b",
        locationId: otherLocation?.id ?? "",
        name: "Caja 1",
      },
      {
        id: "00000000-0000-4000-8000-00000000000a",
        locationId: await seededLocationId(db),
        name: "Caja 1",
      },
    ]);

    const listed = await new DrizzleSnapshotBackupsReader(db).registersForBackups();

    expect(listed).toEqual([
      { id: "00000000-0000-4000-8000-00000000000a", name: "Caja 1" },
      { id: "00000000-0000-4000-8000-00000000000b", name: "Caja 1" },
    ]);
  });
});

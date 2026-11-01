import { ANOTHER_FICTIONAL_CUIT, FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { suppliers } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzlePurchasingListReader } from "./drizzle-purchasing-list-reader.js";
import { insertActor } from "./test-support/purchasing-fixtures.js";

let testDatabase: TestDatabase;
let db: TestDatabase["db"];
let actorId: string;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
  actorId = await insertActor(db);
});

describe("DrizzlePurchasingListReader", () => {
  it("lists every supplier, deactivated ones included, by name", async () => {
    await db.insert(suppliers).values([
      { name: "Zeta", cuit: FICTIONAL_CUIT, active: false, actorId },
      {
        name: "Alfa",
        cuit: ANOTHER_FICTIONAL_CUIT,
        contact: "Marta",
        note: "Martes",
        version: 3,
        actorId,
      },
    ]);

    const listed = await new DrizzlePurchasingListReader(db).suppliers();

    expect(listed).toEqual([
      {
        id: expect.any(String),
        name: "Alfa",
        cuit: ANOTHER_FICTIONAL_CUIT,
        contact: "Marta",
        note: "Martes",
        active: true,
        version: 3,
      },
      {
        id: expect.any(String),
        name: "Zeta",
        cuit: FICTIONAL_CUIT,
        contact: null,
        note: null,
        active: false,
        version: 1,
      },
    ]);
  });
});

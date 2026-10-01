import { emitEnrollmentCode } from "@purosur/domain/register/use-cases";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditLog,
  locations,
  registerEnrollmentCodes,
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
        store: new DrizzleBranchRegisterStore(db),
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

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { branchSettings } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleAlertEmailBranchReader } from "./drizzle-alert-email-branch-reader.js";

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

describe("DrizzleAlertEmailBranchReader", () => {
  it("answers the address set in the branch's settings", async () => {
    const locationId = await seededLocationId(db);
    await db
      .update(branchSettings)
      .set({ address: "Av. Siempreviva 742" })
      .where(eq(branchSettings.locationId, locationId));

    await expect(
      new DrizzleAlertEmailBranchReader(db).alertEmailBranchAddress(locationId),
    ).resolves.toBe("Av. Siempreviva 742");
  });

  it("answers no address for a branch it has no settings for", async () => {
    await expect(
      new DrizzleAlertEmailBranchReader(db).alertEmailBranchAddress(randomUUID()),
    ).resolves.toBeNull();
  });
});

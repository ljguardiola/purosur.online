import {
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { issuerIdentification } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleIssuerIdentificationReader } from "./drizzle-issuer-identification-reader.js";

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

describe("DrizzleIssuerIdentificationReader", () => {
  it("answers an incomplete identification at version 1 before any edit", async () => {
    expect(await new DrizzleIssuerIdentificationReader(db).currentIssuerIdentification()).toEqual({
      legalName: null,
      grossIncomeRegistration: null,
      activityStartDate: null,
      version: 1,
    });
  });

  it("answers the saved identification once it has been set", async () => {
    await db.update(issuerIdentification).set({
      legalName: FICTIONAL_LEGAL_NAME,
      grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
      activityStartDate: "2020-01-15",
      version: 2,
    });

    expect(await new DrizzleIssuerIdentificationReader(db).currentIssuerIdentification()).toEqual({
      legalName: FICTIONAL_LEGAL_NAME,
      grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
      activityStartDate: "2020-01-15",
      version: 2,
    });
  });

  it("fails when the singleton row is missing", async () => {
    await db.delete(issuerIdentification);

    await expect(
      new DrizzleIssuerIdentificationReader(db).currentIssuerIdentification(),
    ).rejects.toThrow("issuer identification row missing");
  });
});

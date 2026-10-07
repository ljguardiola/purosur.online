import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { arcaWsaaTokens } from "../platform/db/schema.js";
import { buildTestDatabase, type TestDatabase } from "../test-support/build-test-database.js";
import { DrizzleWsaaTokenReader } from "./drizzle-wsaa-token-reader.js";

const SERVICE = "wsfe";
const FINGERPRINT = "AA:BB";
const TOKEN = {
  token: "token-1",
  sign: "sign-1",
  issuedAt: new Date("2026-10-01T00:00:00.000Z"),
  expiresAt: new Date("2026-10-01T12:00:00.000Z"),
};

let testDatabase: TestDatabase;

beforeAll(async () => {
  testDatabase = await buildTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

beforeEach(async () => {
  await testDatabase.clear();
});

describe("DrizzleWsaaTokenReader", () => {
  it("answers the token held for the service and certificate", async () => {
    await testDatabase.db
      .insert(arcaWsaaTokens)
      .values({ service: SERVICE, certificateFingerprint: FINGERPRINT, ...TOKEN });
    const reader = new DrizzleWsaaTokenReader(testDatabase.db);

    await expect(reader.currentWsaaToken(SERVICE, FINGERPRINT)).resolves.toEqual(TOKEN);
  });

  it("answers none when no token is held", async () => {
    const reader = new DrizzleWsaaTokenReader(testDatabase.db);

    await expect(reader.currentWsaaToken(SERVICE, FINGERPRINT)).resolves.toBeNull();
  });

  it("does not answer the token of another service or another certificate", async () => {
    await testDatabase.db.insert(arcaWsaaTokens).values([
      { service: "other", certificateFingerprint: FINGERPRINT, ...TOKEN },
      { service: SERVICE, certificateFingerprint: "CC:DD", ...TOKEN },
    ]);
    const reader = new DrizzleWsaaTokenReader(testDatabase.db);

    await expect(reader.currentWsaaToken(SERVICE, FINGERPRINT)).resolves.toBeNull();
  });
});
